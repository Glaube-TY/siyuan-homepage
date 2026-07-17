<script lang="ts">
    import AccountingIcon from "./AccountingIcon.svelte";
    import type { AccountingIconName } from "./accountingIconTypes";

    interface IconOption {
        key: AccountingIconName;
        label: string;
    }

    const ICON_OPTIONS: IconOption[] = [
        { key: "utensils", label: "餐饮" },
        { key: "coffee", label: "咖啡" },
        { key: "apple", label: "水果" },
        { key: "shoppingBag", label: "购物" },
        { key: "shirt", label: "服饰" },
        { key: "smartphone", label: "数码" },
        { key: "tv", label: "家电" },
        { key: "home", label: "居家" },
        { key: "car", label: "出行" },
        { key: "train", label: "交通" },
        { key: "wifi", label: "通讯" },
        { key: "plane", label: "旅行" },
        { key: "tent", label: "露营" },
        { key: "mountain", label: "户外" },
        { key: "bookOpen", label: "学习" },
        { key: "gamepad2", label: "游戏" },
        { key: "music", label: "音乐" },
        { key: "clapperboard", label: "影视" },
        { key: "building2", label: "住房" },
        { key: "dumbbell", label: "运动" },
        { key: "gift", label: "送礼" },
        { key: "stethoscope", label: "医疗" },
        { key: "baby", label: "育儿" },
        { key: "pawPrint", label: "宠物" },
        { key: "briefcase", label: "工资" },
        { key: "award", label: "奖金" },
        { key: "hand", label: "兼职" },
        { key: "receipt", label: "报销" },
        { key: "piggyBank", label: "储蓄" },
        { key: "coins", label: "理财" },
        { key: "banknote", label: "现金" },
        { key: "landmark", label: "银行" },
        { key: "trendingUp", label: "投资" },
        { key: "wallet", label: "钱包" },
        { key: "moreHorizontal", label: "其它" },
        { key: "arrowRightLeft", label: "转账" },
    ];

    interface Props {
        value: AccountingIconName;
        onChange: (iconKey: AccountingIconName) => void;
        onClose: () => void;
    }

    let { value, onChange, onClose }: Props = $props();
</script>

<div class="ac-icon-picker" role="dialog" aria-label="选择图标">
    <div class="ac-icon-picker-header">
        <span>选择图标</span>
        <button class="ac-icon-picker-close" onclick={onClose}>×</button>
    </div>
    <div class="ac-icon-picker-grid">
        {#each ICON_OPTIONS as opt (opt.key)}
            <button
                class="ac-icon-option"
                class:selected={value === opt.key}
                onclick={() => { onChange(opt.key); onClose(); }}
                title={opt.label}
            >
                <AccountingIcon name={opt.key} size={22} />
                <span class="ac-icon-option-label">{opt.label}</span>
            </button>
        {/each}
    </div>
</div>

<style lang="scss">
    .ac-icon-picker {
        min-width: 320px;
        max-width: 400px;
        max-height: calc(100vh - 32px);
        max-height: calc(100dvh - 32px);
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 0.75rem;
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-background);
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    }

    .ac-icon-picker-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.6rem;
        font-weight: 600;
        font-size: 0.88rem;
    }

    .ac-icon-picker-close {
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 1.2rem;
        color: var(--b3-theme-on-surface-light);
        padding: 0.2rem 0.4rem;
        border-radius: 4px;
    }

    .ac-icon-picker-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 0.35rem;
    }

    .ac-icon-option {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.2rem;
        padding: 0.4rem 0.2rem;
        border: 1.5px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
        cursor: pointer;
        font: inherit;
        transition: all 0.12s;
    }

    .ac-icon-option:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 6%, transparent);
    }

    .ac-icon-option.selected {
        border-color: var(--b3-theme-primary);
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        color: var(--b3-theme-primary);
    }

    .ac-icon-option-label {
        font-size: 0.6rem;
        line-height: 1.1;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
    }
</style>
