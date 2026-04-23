<script lang="ts">
    import type { StylesSettingsState, StylesSettingsActions } from '../types';
    import SettingSection from '@/libs/components/SettingSection.svelte';
    import SettingRow from '@/libs/components/SettingRow.svelte';

    interface Props {
        state: StylesSettingsState;
        actions: StylesSettingsActions;
    }

    let { state, actions }: Props = $props();
</script>

<SettingSection title="页脚">
    <SettingRow title="显示页脚" description="在主页底部显示自定义页脚内容">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={state.footerEnabled}
            onchange={(e) => actions.onFooterEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    {#if state.footerEnabled}
        <SettingRow title="页脚内容" description="支持 HTML 标签">
            <textarea
                class="control-full"
                rows="3"
                placeholder="输入页脚内容"
                value={state.footerContent}
                oninput={(e) => actions.onFooterContentChange((e.currentTarget as HTMLTextAreaElement).value)}
            ></textarea>
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="鼠标样式">
    <SettingRow title="鼠标图标" description="选择自定义鼠标指针样式">
        <select
            class="control-md"
            value={state.mouseIcon}
            onchange={(e) => actions.onMouseIconChange((e.currentTarget as HTMLSelectElement).value)}
        >
            <option value="default">默认</option>
            <option value="arrow1">箭头1</option>
            <option value="arrow2">箭头2</option>
            <option value="arrow3">箭头3</option>
            <option value="arrow4">箭头4</option>
            <option value="arrow5">箭头5</option>
            <option value="arrow6">箭头6</option>
            <option value="arrow7">箭头7</option>
            <option value="LOL1">LOL1</option>
            <option value="LOL2">LOL2</option>
            <option value="LOL3">LOL3</option>
            <option value="LOL4">LOL4</option>
            <option value="CBPK2077">赛博朋克2077</option>
            <option value="CYWL1">初音未来1</option>
            <option value="CYWL2">初音未来2</option>
            <option value="cat1">喵星人1</option>
            <option value="cat2">喵星人2</option>
            <option value="cat3">喵星人3</option>
            <option value="WDSJsword">钻石剑</option>
            <option value="WDSJpickaxe">钻石镐</option>
        </select>
    </SettingRow>
    <SettingRow title="应用于全局" description="鼠标样式应用到整个思源笔记">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={state.mouseGlobalEnabled}
            onchange={(e) => actions.onMouseGlobalEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>
    <SettingRow title="鼠标轨迹" description="显示鼠标移动轨迹效果">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={state.mouseTrailEnabled}
            onchange={(e) => actions.onMouseTrailEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>
    <SettingRow title="点击特效" description="点击时显示特效文字">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={state.clickEffectEnabled}
            onchange={(e) => actions.onClickEffectEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>

    {#if state.clickEffectEnabled}
        <SettingRow title="特效内容" description="每行一个特效文字">
            <textarea
                class="control-full"
                rows="3"
                placeholder="输入点击特效内容（每行一个特效）"
                value={state.clickEffectContent}
                oninput={(e) => actions.onClickEffectContentChange((e.currentTarget as HTMLTextAreaElement).value)}
            ></textarea>
        </SettingRow>
    {/if}
</SettingSection>

<SettingSection title="飘落特效">
    <SettingRow title="开启飘落特效" description="在页面上显示飘落动画">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={state.fallEffectsEnabled}
            onchange={(e) => actions.onFallEffectsEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>
    <SettingRow title="应用于全局" description="飘落特效应用到整个思源笔记">
        <input
            type="checkbox"
            class="b3-switch fn__flex-center"
            checked={state.globalFallingEffectsEnabled}
            onchange={(e) => actions.onGlobalFallingEffectsEnabledChange((e.currentTarget as HTMLInputElement).checked)}
        />
    </SettingRow>
    <SettingRow title="飘落图形" description="选择飘落的图形样式">
        <select
            class="control-md"
            value={state.fallingIcon}
            onchange={(e) => actions.onFallingIconChange((e.currentTarget as HTMLSelectElement).value)}
        >
            <option value="snow">雪花</option>
            <option value="heart">爱心</option>
            <option value="star">五角星</option>
            <option value="greenery">绿叶</option>
            <option value="mapleLeaf">枫叶</option>
            <option value="ginkgoLeaf">银杏叶</option>
            <option value="bodhiLeaf">菩提叶</option>
            <option value="bambooLeaf">竹叶</option>
            <option value="cherry">樱花</option>
            <option value="cherryPetal">樱花瓣</option>
            <option value="Rinka">梨花</option>
            <option value="rose">玫瑰花</option>
            <option value="dandelion">蒲公英</option>
            <option value="QZHIHE">千纸鹤</option>
            <option value="paperPlane">纸飞机</option>
            <option value="HMBB">海绵宝宝</option>
            <option value="PDX">派大星</option>
        </select>
    </SettingRow>
    <SettingRow title="密度" description="飘落图形的数量">
        <select
            class="control-sm"
            value={state.fallingDensity}
            onchange={(e) => actions.onFallingDensityChange((e.currentTarget as HTMLSelectElement).value)}
        >
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
        </select>
    </SettingRow>
    <SettingRow title="速度" description="飘落图形的下落速度">
        <select
            class="control-sm"
            value={state.fallingSpeed}
            onchange={(e) => actions.onFallingSpeedChange((e.currentTarget as HTMLSelectElement).value)}
        >
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
        </select>
    </SettingRow>
</SettingSection>