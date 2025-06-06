import { svelteDialog } from "../../../libs/dialog";
import RemoteImageSettings from "./remote-image.svelte";

export function handleLocalImageUpload(plugin: any, bannerImage: HTMLImageElement) {
    return (event: Event) => {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const file = input.files[0];
            const reader = new FileReader();

            reader.onload = async function (e) {
                const url = e.target?.result as string;
                bannerImage.src = url;

                // 保存至插件数据
                await plugin.saveData("bannerImage.json", { url });
            };

            reader.readAsDataURL(file);
        }
    };
}

export function promptForRemoteImage(plugin: any, bannerImage: HTMLImageElement) {
    return () => {
        const dialogRef = svelteDialog({
            title: "远程图片链接",
            constructor: (container: HTMLElement) => {
                return new RemoteImageSettings({
                    target: container,
                    props: {
                        plugin: plugin,
                        onSaveSuccess: (url: string) => {
                            bannerImage.src = url;
                        },
                        onClose: () => {
                            dialogRef.close();
                        },
                    },
                });
            },
        });
    };
}

// 重置横幅图片位置
export function resetBannerPosition(bannerImage: HTMLImageElement) {
    return () => {
        bannerImage.style.transform = 'translateY(0)';
    };
}