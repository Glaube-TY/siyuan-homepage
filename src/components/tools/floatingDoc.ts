import {
    computePosition,
    autoUpdate,
    offset,
    flip,
    shift
} from "@floating-ui/dom";
import { Protyle } from "siyuan";

// 全局悬浮窗管理器
class FloatingDocManager {
    private floatingElement: HTMLElement | null = null;
    private referenceElement: HTMLElement | null = null;
    private cleanupAutoUpdate: (() => void) | null = null;
    private currentNote: any = null;
    private isMouseInPopup: boolean = false;
    private isMouseOnTrigger: boolean = false;
    private hideTimeout: number | null = null;
    private protyle: any = null;
    private protyleContainer: HTMLElement | null = null;
    private plugin: any = null;

    constructor() {
        this.createFloatingElement();
    }

    private createFloatingElement(): void {
        if (this.floatingElement) return;

        this.floatingElement = document.createElement('div');
        this.floatingElement.className = 'hover-popup-global';
        this.floatingElement.setAttribute('role', 'tooltip');
        this.floatingElement.style.cssText = `
            position: fixed;
            z-index: 9999;
            background: var(--b3-theme-background);
            border: 1px solid var(--b3-border-color);
            border-radius: 12px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
            width: 600px;
            height: 500px;
            pointer-events: auto;
            backdrop-filter: blur(12px);
            opacity: 0;
            transition: opacity 0.2s ease-out, transform 0.2s ease-out;
            transform: translateY(4px);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        // 添加鼠标事件监听
        this.floatingElement.addEventListener('mouseenter', () => {
            this.isMouseInPopup = true;
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
        });

        this.floatingElement.addEventListener('mouseleave', () => {
            this.isMouseInPopup = false;
            this.scheduleHide();
        });

        document.body.appendChild(this.floatingElement);
    }

    private scheduleHide(): void {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
        }

        this.hideTimeout = window.setTimeout(() => {
            // 只有在鼠标不在弹窗中，且不在触发器上时才隐藏
            if (!this.isMouseInPopup && !this.isMouseOnTrigger) {
                this.hide();
            }
        }, 200); // 延迟200ms隐藏，给用户足够时间从列表项移入弹窗
    }

    private async updateContent(note: any): Promise<void> {
        if (!this.floatingElement || !note) return;

        // 创建Protyle编辑器容器
        this.floatingElement.innerHTML = `
            <div class="popup-header" style="padding: 12px 16px; border-bottom: 1px solid var(--b3-border-color); background: var(--b3-theme-background); border-radius: 12px 12px 0 0; flex-shrink: 0;">
                <span class="popup-title" style="font-weight: 600; font-size: 14px; color: var(--b3-theme-on-surface); display: block; word-wrap: break-word;">${note.content}</span>
            </div>
            <div class="popup-protyle" style="flex: 1; overflow: hidden; border-radius: 0 0 12px 12px; background: var(--b3-theme-background);">
                <div class="protyle-content" style="height: 100%; width: 100%;"></div>
            </div>
        `;

        // 添加Protyle样式
        const style = document.createElement('style');
        style.textContent = `
            .hover-popup-global .protyle {
                height: 100% !important;
                border: none !important;
                box-shadow: none !important;
                border-radius: 0 !important;
            }
            .hover-popup-global .protyle-content {
                height: 100% !important;
                padding: 0 !important;
            }
            .hover-popup-global .protyle-wysiwyg {
                padding: 16px !important;
                min-height: 100% !important;
            }
            .hover-popup-global .protyle-toolbar {
                position: sticky !important;
                top: 0 !important;
                z-index: 100 !important;
                background: var(--b3-theme-background) !important;
                border-bottom: 1px solid var(--b3-border-color) !important;
            }
        `;
        document.head.appendChild(style);

        // 获取Protyle容器
        this.protyleContainer = this.floatingElement.querySelector('.protyle-content') as HTMLElement;
        if (!this.protyleContainer) return;

        // 初始化Protyle编辑器
        if (this.plugin) {
            try {
                this.protyle = new Protyle(this.plugin.app, this.protyleContainer, {
                    blockId: note.id,
                    mode: 'preview', // 预览模式，可以查看和编辑
                    toolbar: [
                        "emoji",
                        "headings",
                        "bold",
                        "italic",
                        "strike",
                        "link",
                        "code",
                        "upload",
                        "undo",
                        "redo"
                    ], // 简化工具栏
                });
            } catch (error) {
                console.error('Protyle初始化失败:', error);
                // 降级显示简单内容
                this.protyleContainer.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: var(--b3-theme-on-surface-light);">
                        <p>文档内容加载中...</p>
                        <p style="font-size: 12px; margin-top: 10px;">ID: ${note.id}</p>
                    </div>
                `;
            }
        }
    }

    private async updatePosition(referenceElement: HTMLElement, mouseX?: number, mouseY?: number): Promise<void> {
        if (!this.floatingElement) return;

        if (mouseX && mouseY) {
            // 鼠标周围定位
            const { x, y } = await computePosition(
                { getBoundingClientRect: () => ({ left: mouseX, top: mouseY, right: mouseX, bottom: mouseY, width: 0, height: 0, x: mouseX, y: mouseY }) },
                this.floatingElement,
                {
                    placement: 'bottom-start',
                    middleware: [
                        offset(15),
                        flip(),
                        shift({ padding: 10 })
                    ]
                }
            );
            Object.assign(this.floatingElement.style, {
                left: `${x}px`,
                top: `${y}px`,
                opacity: '1'
            });
        } else if (referenceElement) {
            // 使用元素定位
            const { x, y } = await computePosition(referenceElement, this.floatingElement, {
                placement: 'right-start',
                middleware: [
                    offset(8),
                    flip(),
                    shift({ padding: 10 })
                ]
            });
            Object.assign(this.floatingElement.style, {
                left: `${x}px`,
                top: `${y}px`,
                opacity: '1'
            });

            // 启动自动更新
            if (!this.cleanupAutoUpdate) {
                this.cleanupAutoUpdate = autoUpdate(referenceElement, this.floatingElement, () => this.updatePosition(referenceElement));
            }
        }
    }

    public async show(note: any, event: MouseEvent, plugin?: any): Promise<void> {
        this.currentNote = note;
        this.referenceElement = event.currentTarget as HTMLElement;
        this.isMouseOnTrigger = true;
        this.plugin = plugin;

        // 清除之前的隐藏定时器
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }

        await this.updateContent(note);
        this.updatePosition(this.referenceElement, event.clientX, event.clientY);

        if (this.floatingElement) {
            this.floatingElement.style.opacity = '1';
            this.floatingElement.style.pointerEvents = 'auto';
            this.floatingElement.style.transform = 'translateY(0)';
        }
    }

    public setMouseOnTrigger(isOn: boolean): void {
        this.isMouseOnTrigger = isOn;
        if (!isOn) {
            this.scheduleHide();
        }
    }

    public hideImmediately(): void {
        // 强制立即隐藏，重置所有状态
        this.isMouseInPopup = false;
        this.isMouseOnTrigger = false;
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }

        // 清理Protyle实例
        if (this.protyle) {
            try {
                this.protyle.destroy();
            } catch (error) {
                console.warn('Protyle销毁失败:', error);
            }
            this.protyle = null;
        }

        this.hide();
    }

    public hide(): void {
        // 只有在鼠标不在弹窗内，且不在触发器上时才隐藏
        if (this.isMouseInPopup || this.isMouseOnTrigger) {
            return;
        }

        // 清理Protyle实例
        if (this.protyle) {
            try {
                this.protyle.destroy();
            } catch (error) {
                console.warn('Protyle销毁失败:', error);
            }
            this.protyle = null;
        }

        if (this.floatingElement) {
            this.floatingElement.style.opacity = '0';
            this.floatingElement.style.pointerEvents = 'none';
            this.floatingElement.style.transform = 'translateY(4px)';
        }

        this.currentNote = null;
        this.protyleContainer = null;

        if (this.cleanupAutoUpdate) {
            this.cleanupAutoUpdate();
            this.cleanupAutoUpdate = null;
        }
    }

    public destroy(): void {
        // 清理Protyle实例
        if (this.protyle) {
            try {
                this.protyle.destroy();
            } catch (error) {
                console.warn('Protyle销毁失败:', error);
            }
            this.protyle = null;
        }

        this.hide();
        if (this.floatingElement) {
            this.floatingElement.remove();
            this.floatingElement = null;
        }
        if (this.cleanupAutoUpdate) {
            this.cleanupAutoUpdate();
            this.cleanupAutoUpdate = null;
        }
        this.protyleContainer = null;
        this.plugin = null;
    }
}

// 创建全局实例
const floatingDocManager = new FloatingDocManager();

// 导出函数
export function createFloatingDocPopup(note: any, event: MouseEvent, plugin?: any): void {
    floatingDocManager.show(note, event, plugin);
}

export function handleMouseLeave(): void {
    floatingDocManager.hide();
}

export function setMouseOnTrigger(isOn: boolean): void {
    floatingDocManager.setMouseOnTrigger(isOn);
}

export function hideImmediately(): void {
    floatingDocManager.hideImmediately();
}

export function destroyFloatingDoc(): void {
    floatingDocManager.destroy();
}