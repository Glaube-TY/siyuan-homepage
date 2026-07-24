import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync, spawnSync } from 'node:child_process';

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const RELEASE_NOTES_INSTRUCTIONS_PATTERN =
    /<!-- release-notes-editor:instructions:start -->[\s\S]*?<!-- release-notes-editor:instructions:end -->\s*/;
const pipedAnswers = process.stdin.isTTY ? null : readFileSync(0, 'utf8').split(/\r?\n/);
const promptInterface = process.stdin.isTTY
    ? readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })
    : null;

async function readJsonFile(filePath) {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJsonFile(filePath, jsonData) {
    await fs.writeFile(filePath, `${JSON.stringify(jsonData, null, 2)}\n`, 'utf8');
}

function promptUser(query) {
    if (pipedAnswers) {
        process.stdout.write(query);
        return Promise.resolve(pipedAnswers.shift() ?? '');
    }

    return new Promise((resolve) => promptInterface.question(query, resolve));
}

function closePrompt() {
    promptInterface?.close();
}

function parseVersion(version) {
    const match = VERSION_PATTERN.exec(String(version).trim());
    if (!match) {
        return null;
    }

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    };
}

function assertValidVersion(version, label = 'version') {
    const parsed = parseVersion(version);
    if (!parsed) {
        throw new Error(`${label} must use a.b.c format, got: ${version}`);
    }
    return parsed;
}

function compareVersions(a, b) {
    const left = assertValidVersion(a, 'left version');
    const right = assertValidVersion(b, 'right version');

    for (const key of ['major', 'minor', 'patch']) {
        if (left[key] > right[key]) return 1;
        if (left[key] < right[key]) return -1;
    }
    return 0;
}

function incrementVersion(version, type) {
    const next = assertValidVersion(version);

    switch (type) {
        case 'major':
            next.major += 1;
            next.minor = 0;
            next.patch = 0;
            break;
        case 'minor':
            next.minor += 1;
            next.patch = 0;
            break;
        case 'patch':
            next.patch += 1;
            break;
        default:
            throw new Error(`Unknown version increment type: ${type}`);
    }

    return `${next.major}.${next.minor}.${next.patch}`;
}

function normalizeReleaseNotes(notes, version) {
    const normalized = String(notes || '')
        .replace(/\\n/g, '\n')
        .trim();

    return normalized || `Release v${version}`;
}

function normalizeReleaseSummary(summary) {
    return String(summary || '')
        .replace(/\\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function createReleaseLabels(version, summary) {
    const normalizedSummary = normalizeReleaseSummary(summary);
    const suffix = normalizedSummary ? ` - ${normalizedSummary}` : '';

    return {
        commitSubject: `release: v${version}${suffix}`,
        tagTitle: `v${version}${suffix}`,
    };
}

function printCommand(command, args) {
    console.log(`\n[release] $ ${[command, ...args].join(' ')}`);
}

function run(command, args, options = {}) {
    printCommand(command, args);
    execFileSync(command, args, {
        stdio: 'inherit',
        ...options,
    });
}

function runPnpm(args) {
    printCommand('pnpm', args);

    if (process.platform === 'win32') {
        execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', ['pnpm', ...args].join(' ')], {
            stdio: 'inherit',
        });
        return;
    }

    execFileSync('pnpm', args, { stdio: 'inherit' });
}

function getOutput(command, args) {
    return execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

function commandSucceeds(command, args) {
    try {
        execFileSync(command, args, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function ensureMainBranch() {
    const branch = getOutput('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch !== 'main') {
        throw new Error(`Release must run from main, current branch is: ${branch}`);
    }
}

function ensureMainCanPush() {
    const localHead = getOutput('git', ['rev-parse', 'HEAD']);
    const remoteHead = getOutput('git', ['rev-parse', 'origin/main']);

    if (localHead === remoteHead) {
        return;
    }

    const remoteIsAncestor = commandSucceeds('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
    if (!remoteIsAncestor) {
        throw new Error('Local main is behind or diverged from origin/main. Pull or rebase before releasing.');
    }
}

function ensureTagDoesNotExist(version) {
    const tag = `v${version}`;
    if (commandSucceeds('git', ['show-ref', '--verify', '--quiet', `refs/tags/${tag}`])) {
        throw new Error(`Local tag already exists: ${tag}`);
    }
    if (commandSucceeds('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`])) {
        throw new Error(`Remote tag already exists: ${tag}`);
    }
}

function getGitStatus() {
    try {
        return getOutput('git', ['status', '--short']);
    } catch {
        return '';
    }
}

function resolveGitPath(fileName) {
    const gitPath = getOutput('git', ['rev-parse', '--git-path', fileName]);
    return path.isAbsolute(gitPath) ? gitPath : path.resolve(process.cwd(), gitPath);
}

function getPreviousReleaseTag(currentVersion) {
    const currentTag = `v${currentVersion}`;
    if (
        commandSucceeds('git', ['show-ref', '--verify', '--quiet', `refs/tags/${currentTag}`])
        && commandSucceeds('git', ['merge-base', '--is-ancestor', currentTag, 'HEAD'])
    ) {
        return currentTag;
    }

    try {
        return getOutput('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD']);
    } catch {
        return '';
    }
}

function getCommitsSinceTag(previousTag) {
    if (!previousTag) return [];

    const output = getOutput('git', [
        'log',
        '--reverse',
        '--format=%H%x1f%h%x1f%s%x1f%b%x1e',
        `${previousTag}..HEAD`,
    ]);
    if (!output) return [];

    return output
        .split('\x1e')
        .map((record) => record.trim())
        .filter(Boolean)
        .map((record) => {
            const [hash = '', shortHash = '', subject = '', ...bodyParts] = record.split('\x1f');
            return {
                hash,
                shortHash,
                subject: subject.trim(),
                body: bodyParts.join('\x1f').trim(),
            };
        });
}

function formatCommitAsReleaseNote(commit) {
    const subject = commit.subject || `Commit ${commit.shortHash}`;
    const lines = [`- ${subject} (\`${commit.shortHash}\`)`];
    if (commit.body) {
        lines.push('');
        lines.push(...commit.body.split(/\r?\n/).map((line) => line ? `  ${line}` : ''));
    }
    return lines.join('\n');
}

function createReleaseNotesDraft(version, previousTag, commits) {
    const rangeLabel = previousTag ? `${previousTag}..HEAD` : '未找到可用的上一 release tag';
    const generatedNotes = commits.length > 0
        ? commits.map(formatCommitAsReleaseNote).join('\n\n')
        : `- Release v${version}`;

    return [
        '<!-- release-notes-editor:instructions:start -->',
        '请在下方编辑本次发布的详细更新日志。',
        '每个一级无序列表项对应一次提交；可以增删、合并或重写内容。',
        '保存并关闭此文件后，release 流程会自动继续。',
        '本说明块不会进入 Git commit、tag 或 GitHub Release。',
        `自动生成范围：${rangeLabel}`,
        `检测到提交数：${commits.length}`,
        '<!-- release-notes-editor:instructions:end -->',
        '',
        generatedNotes,
        '',
    ].join('\n');
}

function parseEditorCommand(editorCommand) {
    const parts = String(editorCommand || '').match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    return parts.map((part) => {
        if (
            (part.startsWith('"') && part.endsWith('"'))
            || (part.startsWith("'") && part.endsWith("'"))
        ) {
            return part.slice(1, -1);
        }
        return part;
    });
}

function getOptionalOutput(command, args) {
    try {
        return getOutput(command, args);
    } catch {
        return '';
    }
}

function resolveReleaseEditor() {
    const configuredEditor =
        process.env.RELEASE_EDITOR
        || process.env.GIT_EDITOR
        || getOptionalOutput('git', ['config', '--get', 'core.editor'])
        || process.env.VISUAL
        || process.env.EDITOR;
    if (configuredEditor) return configuredEditor;

    if (process.env.TERM_PROGRAM === 'vscode') return 'code --wait';

    const hasCodeCommand = process.platform === 'win32'
        ? commandSucceeds('where.exe', ['code'])
        : commandSucceeds('sh', ['-c', 'command -v code >/dev/null 2>&1']);
    if (hasCodeCommand) return 'code --wait';

    return process.platform === 'win32' ? 'notepad.exe' : 'vi';
}

function openReleaseNotesEditor(filePath) {
    const editorParts = parseEditorCommand(resolveReleaseEditor());
    if (editorParts.length === 0) {
        throw new Error('No release notes editor is configured.');
    }

    const [editorCommand, ...editorArgs] = editorParts;
    const editorName = path.basename(editorCommand).toLowerCase();
    if (
        /^(code|code-insiders|codium)(?:\.cmd|\.exe)?$/.test(editorName)
        && !editorArgs.includes('--wait')
    ) {
        editorArgs.push('--wait');
    }

    console.log(`\n[release] Opening release notes editor: ${filePath}`);
    console.log('[release] Save and close the editor file to continue.');
    promptInterface?.pause();
    try {
        const extension = path.extname(editorCommand).toLowerCase();
        const needsShell = process.platform === 'win32'
            && (!extension || extension === '.cmd' || extension === '.bat');
        const result = spawnSync(editorCommand, [...editorArgs, filePath], {
            stdio: 'inherit',
            shell: needsShell,
        });
        if (result.error) throw result.error;
        if (result.status !== 0) {
            throw new Error(`Release notes editor exited with status ${result.status ?? 'unknown'}.`);
        }
    } finally {
        promptInterface?.resume();
    }
}

async function editReleaseNotes(version, previousTag, commits) {
    const releaseNotesPath = resolveGitPath('RELEASE_NOTES.md');
    await fs.writeFile(
        releaseNotesPath,
        createReleaseNotesDraft(version, previousTag, commits),
        'utf8',
    );

    if (pipedAnswers) {
        const pipedNotes = pipedAnswers.shift() ?? '';
        if (pipedNotes.trim()) {
            await fs.writeFile(releaseNotesPath, normalizeReleaseNotes(pipedNotes, version), 'utf8');
        }
        console.log(`\n[release] Non-interactive mode: using release notes from ${releaseNotesPath}`);
    } else {
        openReleaseNotesEditor(releaseNotesPath);
    }

    const editedNotes = await fs.readFile(releaseNotesPath, 'utf8');
    const releaseNotes = editedNotes
        .replace(RELEASE_NOTES_INSTRUCTIONS_PATTERN, '')
        .trim();
    return {
        releaseNotes: normalizeReleaseNotes(releaseNotes, version),
        releaseNotesPath,
    };
}

async function writeReleaseGitMessageFiles(releaseLabels, releaseNotes) {
    const commitMessagePath = resolveGitPath('RELEASE_COMMIT_MESSAGE.txt');
    const tagMessagePath = resolveGitPath('RELEASE_TAG_MESSAGE.txt');
    await fs.writeFile(
        commitMessagePath,
        `${releaseLabels.commitSubject}\n\n${releaseNotes}\n`,
        'utf8',
    );
    await fs.writeFile(
        tagMessagePath,
        `${releaseLabels.tagTitle}\n\n${releaseNotes}\n`,
        'utf8',
    );
    return { commitMessagePath, tagMessagePath };
}

async function restoreVersionFiles(files, originals) {
    await fs.writeFile(files.pluginJsonPath, originals.pluginJson, 'utf8');
    await fs.writeFile(files.packageJsonPath, originals.packageJson, 'utf8');
}

(async function () {
    const pluginJsonPath = path.join(process.cwd(), 'plugin.json');
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const files = { pluginJsonPath, packageJsonPath };
    const originals = {
        pluginJson: await fs.readFile(pluginJsonPath, 'utf8'),
        packageJson: await fs.readFile(packageJsonPath, 'utf8'),
    };
    let versionFilesWritten = false;
    let committed = false;

    try {
        getOutput('git', ['rev-parse', '--is-inside-work-tree']);
        ensureMainBranch();

        const pluginData = await readJsonFile(pluginJsonPath);
        const packageData = await readJsonFile(packageJsonPath);
        const pluginVersion = pluginData.version;
        const packageVersion = packageData.version;

        assertValidVersion(pluginVersion, 'plugin.json version');
        assertValidVersion(packageVersion, 'package.json version');
        if (pluginVersion !== packageVersion) {
            throw new Error(`Version mismatch: plugin.json=${pluginVersion}, package.json=${packageVersion}`);
        }

        const currentVersion = pluginVersion;
        console.log(`\n[release] Current version: ${currentVersion}\n`);

        const newPatchVersion = incrementVersion(currentVersion, 'patch');
        const newMinorVersion = incrementVersion(currentVersion, 'minor');
        const newMajorVersion = incrementVersion(currentVersion, 'major');

        console.log('[release] How would you like to update the version?\n');
        console.log(`   1. Patch version  (${newPatchVersion})`);
        console.log(`   2. Minor version  (${newMinorVersion})`);
        console.log(`   3. Major version  (${newMajorVersion})`);
        console.log('   4. Input version manually');
        console.log('   0. Quit without releasing\n');

        const updateChoice = await promptUser('Please choose (1/2/3/4/0): ');
        let newVersion;

        switch (updateChoice.trim()) {
            case '1':
                newVersion = newPatchVersion;
                break;
            case '2':
                newVersion = newMinorVersion;
                break;
            case '3':
                newVersion = newMajorVersion;
                break;
            case '4':
                newVersion = (await promptUser('Please enter the new version (a.b.c): ')).trim();
                break;
            case '0':
                console.log('\n[release] Release cancelled.');
                return;
            default:
                console.log('\n[release] Invalid option. Release cancelled.');
                return;
        }

        assertValidVersion(newVersion, 'new version');
        if (compareVersions(newVersion, currentVersion) <= 0) {
            throw new Error(`New version must be greater than ${currentVersion}, got ${newVersion}`);
        }

        console.log('\n[release] Enter this release update summary.');
        console.log('[release] This will be used in the git commit title, tag title, and GitHub Release title.');
        console.log('[release] Leave empty to use only the version number.');
        const releaseSummary = normalizeReleaseSummary(await promptUser('Release summary: '));
        const releaseLabels = createReleaseLabels(newVersion, releaseSummary);

        run('git', ['fetch', 'origin', 'main', '--tags']);
        ensureMainCanPush();
        ensureTagDoesNotExist(newVersion);

        const previousReleaseTag = getPreviousReleaseTag(currentVersion);
        const releaseCommits = getCommitsSinceTag(previousReleaseTag);
        console.log(`\n[release] Preparing detailed release notes from ${previousReleaseTag || 'no previous tag'}.`);
        console.log(`[release] Found ${releaseCommits.length} commit(s) to prefill.`);
        const {
            releaseNotes,
            releaseNotesPath,
        } = await editReleaseNotes(newVersion, previousReleaseTag, releaseCommits);

        const status = getGitStatus();
        if (status) {
            console.log('\n[release] Changes that will be included in the release commit:\n');
            console.log(status);
            const includeChanges = await promptUser('\nInclude these changes in the release commit? (y/N): ');
            if (includeChanges.trim().toLowerCase() !== 'y') {
                console.log('\n[release] Release cancelled.');
                return;
            }
        }

        console.log('\n[release] Release metadata preview:');
        console.log(`   Commit: ${releaseLabels.commitSubject}`);
        console.log(`   Tag:    ${releaseLabels.tagTitle}`);
        console.log(`   File:   ${releaseNotesPath}`);
        console.log(`   Notes:  ${releaseNotes.split('\n')[0]}${releaseNotes.includes('\n') ? ' ...' : ''}`);

        const confirmRelease = await promptUser(`\nBuild, commit, tag, and release v${newVersion}? (y/N): `);
        if (confirmRelease.trim().toLowerCase() !== 'y') {
            console.log('\n[release] Release cancelled.');
            return;
        }

        pluginData.version = newVersion;
        packageData.version = newVersion;
        await writeJsonFile(pluginJsonPath, pluginData);
        await writeJsonFile(packageJsonPath, packageData);
        versionFilesWritten = true;
        console.log(`\n[release] Version files updated to ${newVersion}`);

        console.log('\n[release] Running preflight checks.');
        runPnpm(['install', '--frozen-lockfile']);
        runPnpm(['build']);

        run('git', ['add', '-A']);
        if (commandSucceeds('git', ['diff', '--cached', '--quiet'])) {
            throw new Error('Nothing staged for commit after version update and build.');
        }

        const {
            commitMessagePath,
            tagMessagePath,
        } = await writeReleaseGitMessageFiles(releaseLabels, releaseNotes);
        run('git', ['commit', '-F', commitMessagePath]);
        committed = true;
        run('git', ['tag', '-a', `v${newVersion}`, '-F', tagMessagePath]);
        run('git', ['push', 'origin', 'main']);
        run('git', ['push', 'origin', `v${newVersion}`]);

        console.log(`\n[release] Release tag pushed: v${newVersion}`);
        console.log('[release] GitHub Actions will build package.zip and create/update the GitHub Release.');
        console.log('[release] Check: https://github.com/Glaube-TY/siyuan-homepage/actions');
    } catch (error) {
        if (versionFilesWritten && !committed) {
            await restoreVersionFiles(files, originals);
            console.error('\n[release] Version files restored because release did not complete.');
        }
        console.error('\n[release] Release failed:', error instanceof Error ? error.message : error);
        process.exitCode = 1;
    } finally {
        closePrompt();
    }
})();
