<script lang="ts">
    import type { StylesSettingsState, StylesSettingsActions } from '../types';

    interface Props {
        state: StylesSettingsState;
        actions: StylesSettingsActions;
    }

    let { state, actions }: Props = $props();
</script>

<div class="section-setting styles-setting">
    <div class="footer-setting">
        <h3>页脚设置</h3>
        <label for="footer-enable"
            ><input
                id="footer-enable"
                type="checkbox"
                checked={state.footerEnabled}
                onchange={(e) => actions.onFooterEnabledChange((e.currentTarget as HTMLInputElement).checked)}
            /> 显示页脚</label
        >
        {#if state.footerEnabled}
            <label for="footer-content">
                <textarea
                    id="footer-content"
                    placeholder="输入页脚内容"
                    value={state.footerContent}
                    oninput={(e) => actions.onFooterContentChange((e.currentTarget as HTMLTextAreaElement).value)}
                ></textarea>
            </label>
        {/if}
    </div>
    <div class="mouse-setting">
        <h3>鼠标样式设置</h3>
        <label for="mouse-style">
            鼠标图标：
            <select
                name="mouse-style"
                id="mouse-style"
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
        </label>
        <div class="mouse-global-setting">
            <label for="mouse-global">
                <input
                    id="mouse-global"
                    type="checkbox"
                    checked={state.mouseGlobalEnabled}
                    onchange={(e) => actions.onMouseGlobalEnabledChange((e.currentTarget as HTMLInputElement).checked)}
                />应用于全局
            </label>
            <label for="mouse-trail">
                <input
                    id="mouse-trail"
                    type="checkbox"
                    checked={state.mouseTrailEnabled}
                    onchange={(e) => actions.onMouseTrailEnabledChange((e.currentTarget as HTMLInputElement).checked)}
                />鼠标轨迹
            </label>
            <label for="click-effect"
                ><input
                    type="checkbox"
                    checked={state.clickEffectEnabled}
                    onchange={(e) => actions.onClickEffectEnabledChange((e.currentTarget as HTMLInputElement).checked)}
                />点击特效</label
            >
        </div>
        {#if state.clickEffectEnabled}
            <label for="click-effect-content">
                <textarea
                    id="click-effect-content"
                    placeholder="输入点击特效内容（每行一个特效）"
                    value={state.clickEffectContent}
                    oninput={(e) => actions.onClickEffectContentChange((e.currentTarget as HTMLTextAreaElement).value)}
                ></textarea>
            </label>
        {/if}
    </div>
    <div class="background-effects-setting">
        <h3>背景特效设置</h3>
        <div class="background-effects-setting-checkbox">
            <label for=""
                ><input
                    type="checkbox"
                    checked={state.fallEffectsEnabled}
                    onchange={(e) => actions.onFallEffectsEnabledChange((e.currentTarget as HTMLInputElement).checked)}
                />开启飘落特效</label
            ><label for=""
                ><input
                    type="checkbox"
                    checked={state.globalFallingEffectsEnabled}
                    onchange={(e) => actions.onGlobalFallingEffectsEnabledChange((e.currentTarget as HTMLInputElement).checked)}
                />应用于全局</label
            >
        </div>
        <div class="form-group">
            <label for="falling-icon">
                飘落图形：
                <select
                    name="falling-icon"
                    id="falling-icon"
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
            </label>
            <label for=""
                >密度：
                <select
                    value={state.fallingDensity}
                    onchange={(e) => actions.onFallingDensityChange((e.currentTarget as HTMLSelectElement).value)}
                >
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                </select>
            </label>
            <label for=""
                >速度:
                <select
                    value={state.fallingSpeed}
                    onchange={(e) => actions.onFallingSpeedChange((e.currentTarget as HTMLSelectElement).value)}
                >
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                </select>
            </label>
        </div>
    </div>
</div>