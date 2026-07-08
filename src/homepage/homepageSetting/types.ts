export type HomepageSettingMainTab = "homepage" | "aiKnowledgeBase" | "notifyBridge" | "chatActionBridge" | "vip" | "about";
export type HomepageSettingSubTab = "behavior" | "mobile" | "banner" | "title" | "button" | "widgets" | "indexing" | "devices" | "styles";

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
export type ComponentSectionsNavAlign = "left" | "center" | "right";

export interface ComponentSection {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
}

export interface WidgetsSettingsState {
    widgetLayoutNumber: number;
    widgetGap: number;
    advancedEnabled: boolean;
    componentSectionsEnabled: boolean;
    componentSections: ComponentSection[];
    componentSectionsNavAlign: ComponentSectionsNavAlign;
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
    onComponentSectionsEnabledChange: (value: boolean) => void;
    onAddComponentSection: () => void;
    onRenameComponentSection: (sectionId: string, name: string) => void;
    onDeleteComponentSection: (sectionId: string) => void;
    onMoveComponentSectionUp: (sectionId: string) => void;
    onMoveComponentSectionDown: (sectionId: string) => void;
    onComponentSectionsNavAlignChange: (value: ComponentSectionsNavAlign) => void;
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
    backgroundImageEnabled: boolean;
    backgroundImageGlobalEnabled: boolean;
    backgroundImageType: "local" | "remote";
    backgroundImageLocalData: string | null;
    backgroundImageRemoteUrl: string;
    backgroundImageOpacity: number;
    backgroundImageBlur: number;
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
    onBackgroundImageEnabledChange: (value: boolean) => void;
    onBackgroundImageGlobalEnabledChange: (value: boolean) => void;
    onBackgroundImageTypeChange: (value: "local" | "remote") => void;
    onBackgroundImageLocalDataChange: (value: string | null) => void;
    onBackgroundImageRemoteUrlChange: (value: string) => void;
    onBackgroundImageOpacityChange: (value: number) => void;
    onBackgroundImageBlurChange: (value: number) => void;
    onBackgroundImageSelect: (event: Event) => void;
    onFallEffectsEnabledChange: (value: boolean) => void;
    onGlobalFallingEffectsEnabledChange: (value: boolean) => void;
    onFallingIconChange: (value: string) => void;
    onFallingDensityChange: (value: string) => void;
    onFallingSpeedChange: (value: string) => void;
}
