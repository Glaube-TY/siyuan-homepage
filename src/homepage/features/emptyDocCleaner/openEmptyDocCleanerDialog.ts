import { svelteDialog } from "@/libs/dialog";
import EmptyDocCleanerDialog from "./EmptyDocCleanerDialog.svelte";
import { mount } from "svelte";

export function openEmptyDocCleanerDialog(plugin: any) {
    svelteDialog({
        title: "清理空文档",
        width: "960px",
        height: "72vh",
        constructor: (container: HTMLElement) => {
            return mount(EmptyDocCleanerDialog, {
                target: container,
                props: {
                    plugin,
                },
            });
        },
    });
}
