import { svelteDialog } from "@/libs/dialog";
import TemplateCenterDialog from "./TemplateCenterDialog.svelte";
import { mount } from "svelte";

export function openTemplateCenterDialog(plugin: any) {
    svelteDialog({
        title: "主页模板中心",
        width: "1120px",
        height: "78vh",
        constructor: (container: HTMLElement) => {
            return mount(TemplateCenterDialog, {
                target: container,
                props: {
                    plugin,
                },
            });
        },
    });
}
