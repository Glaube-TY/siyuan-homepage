export type HomepageSettingMainTab = "homepage" | "vip" | "about";
export type HomepageSettingSubTab = "banner" | "title" | "button" | "widgets" | "styles" | "devices";

export interface HomepageSettingProps {
    plugin: any;
    close: () => void;
}

export type ButtonItem = {
    id: number;
    label: string;
    checked: boolean;
    shortcut?: string;
    order: number;
    action?: string;
};

export interface ButtonSettingsActions {
    onSelectButton: (item: ButtonItem) => void;
    onAddNewButton: () => void;
    onUpdateButtonLabel: (value: string) => void;
    onUpdateButtonShortcut: (value: string) => void;
    onToggleButtonChecked: (id: number, checked: boolean) => void;
    onDeleteCustomButton: () => void;
    onMoveUpButton: () => void;
    onMoveDownButton: () => void;
}

export type DocPreviewMode = "preview" | "wysiwyg";

export interface WidgetsSettingsState {
    widgetLayoutNumber: number;
    widgetGap: number;
    quickNotesEnabled: boolean;
    quickNotesPosition: string;
    quickNotesTimestampEnabled: boolean;
    quickNotesAddPosition: string;
    taskEditorEnabled: boolean;
    defaultDocPreviewMode: DocPreviewMode;
}

export interface WidgetsSettingsActions {
    onWidgetLayoutNumberChange: (value: number) => void;
    onWidgetGapChange: (value: number) => void;
    onQuickNotesEnabledChange: (value: boolean) => void;
    onQuickNotesPositionChange: (value: string) => void;
    onQuickNotesTimestampEnabledChange: (value: boolean) => void;
    onQuickNotesAddPositionChange: (value: string) => void;
    onTaskEditorEnabledChange: (value: boolean) => void;
    onDefaultDocPreviewModeChange: (value: DocPreviewMode) => void;
}

export interface StylesSettingsState {
    footerEnabled: boolean;
    footerContent: string;
    mouseIcon: string;
    mouseGlobalEnabled: boolean;
    mouseTrailEnabled: boolean;
    clickEffectEnabled: boolean;
    clickEffectContent: string;
    fallEffectsEnabled: boolean;
    globalFallingEffectsEnabled: boolean;
    fallingIcon: string;
    fallingDensity: string;
    fallingSpeed: string;
}

export interface StylesSettingsActions {
    onFooterEnabledChange: (value: boolean) => void;
    onFooterContentChange: (value: string) => void;
    onMouseIconChange: (value: string) => void;
    onMouseGlobalEnabledChange: (value: boolean) => void;
    onMouseTrailEnabledChange: (value: boolean) => void;
    onClickEffectEnabledChange: (value: boolean) => void;
    onClickEffectContentChange: (value: string) => void;
    onFallEffectsEnabledChange: (value: boolean) => void;
    onGlobalFallingEffectsEnabledChange: (value: boolean) => void;
    onFallingIconChange: (value: string) => void;
    onFallingDensityChange: (value: string) => void;
    onFallingSpeedChange: (value: string) => void;
}