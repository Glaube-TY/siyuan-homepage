<script lang="ts">
    import { showMessage } from "siyuan";
    import SettingSection from "@/libs/components/SettingSection.svelte";
    import SettingRow from "@/libs/components/SettingRow.svelte";
    import { canUseElectronLocalFileSystem } from "@/components/tools/runtimeEnv";
    import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";

    interface Props {
        sectionTitle?: string;
        rowTitle?: string;
        path?: string;
        placeholder?: string;
        buttonTitle?: string;
        desktopOnlyMessage?: string;
    }

    let {
        sectionTitle = "文件夹设置",
        rowTitle = "文件夹路径",
        path = $bindable(""),
        placeholder = "请选择文件夹",
        buttonTitle = "选择文件夹",
        desktopOnlyMessage = "此功能仅在桌面版可用"
    }: Props = $props();

    async function selectDirectory() {
        try {
            if (!canUseElectronLocalFileSystem()) {
                return showMessage(desktopOnlyMessage);
            }
            const { filePaths } = await window
                .require("@electron/remote")
                .dialog.showOpenDialog({
                    properties: ["openDirectory", "createDirectory"]
                });

            if (filePaths && filePaths.length > 0) {
                path = filePaths[0];
            }
        } catch (error) {
            console.error("选择文件夹时发生错误：", error);
        }
    }
</script>

<SettingSection title={sectionTitle}>
    <SettingRow title={rowTitle}>
        <div class="file-path-group">
            <input
                type="text"
                bind:value={path}
                placeholder={placeholder}
                class="control-full"
                readonly
            />
            <button title={buttonTitle} onclick={selectDirectory} class="file-action-btn">
                <SiyuanIcon name="folder" size={14} />
            </button>
        </div>
    </SettingRow>
</SettingSection>
