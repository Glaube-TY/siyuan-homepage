import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

async function readJsonFile(filePath) {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJsonFile(filePath, jsonData) {
    await fs.writeFile(filePath, `${JSON.stringify(jsonData, null, 2)}\n`, 'utf8');
}

function promptUser(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
    }));
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

        run('git', ['fetch', 'origin', 'main', '--tags']);
        ensureMainCanPush();
        ensureTagDoesNotExist(newVersion);

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

        run('git', ['commit', '-m', `release: v${newVersion}`]);
        committed = true;
        run('git', ['tag', `v${newVersion}`]);
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
    }
})();
