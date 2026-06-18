<script lang="ts">
    import { showMessage } from "siyuan";

    interface Props {
        USER_NAME: string;
        USER_ID: string;
        USER_CODE: string;
        USER_CODE_V2?: string;
        IDENTITY_SOURCE?: string;
        activated: boolean;
        activationResult: any;
        ActivationCode: string;
        onDeactivate: () => Promise<void>;
        onActivate: () => Promise<void>;
        onActivationCodeChange: (value: string) => void;
    }

    let {
        USER_NAME,
        USER_ID,
        USER_CODE,
        USER_CODE_V2 = "",
        IDENTITY_SOURCE = "",
        activated,
        activationResult,
        ActivationCode,
        onDeactivate,
        onActivate,
        onActivationCodeChange
    }: Props = $props();

    const TUTORIAL_URL = "https://blog.glaube-ty.top/zhu-ye-cha-jian";
    const MEMBER_GROUP_URL = "https://qm.qq.com/q/4ebO3QB6R2";
    const MEMBER_GROUP_NUMBER = "391403097";

    function copyText(text: string, successMessage: string): void {
        if (!text) {
            showMessage("暂无可复制的会员识别码");
            return;
        }

        navigator.clipboard
            .writeText(text)
            .then(() => {
                showMessage(successMessage);
            })
            .catch((err) => {
                console.error("复制失败", err);
                showMessage("复制失败，请手动选择复制");
            });
    }
</script>

<div class="vip-section">
    <div class="vip-info">
        {#if USER_NAME || USER_ID}
            <label for="">用户名：{USER_NAME}</label>
            <label for="">用户ID：{USER_ID}</label>
        {:else}
            <label for="">请先登录后进行查看！</label>
        {/if}
    </div>
    {#if activated}
        <div
            class="activated"
            class:activated-lifetime={activationResult.userInfo.isLifetime}
        >
            <div class="activated-hero">
                <div class="activated-badge">
                    {activationResult.userInfo.isLifetime ? "永久会员" : "会员已激活"}
                </div>
                <h2>
                    {activationResult.userInfo.isLifetime ? "尊享永久会员" : "会员服务已启用"}
                </h2>
                <p class="activated-desc">
                    感谢你对主页插件的支持。愿它继续陪你整理灵感、沉淀知识，也欢迎把使用建议反馈给作者。
                </p>
                {#if activationResult.userInfo.isLifetime}
                    <p class="activated-desc lifetime-desc">
                        你已获得永久会员资格，后续可持续享受会员功能与更新支持。
                    </p>
                {/if}
            </div>

            <div class="activated-stats">
                <div class="activated-stat">
                    <span>到期时间</span>
                    <strong>{activationResult.userInfo.due}</strong>
                </div>
                <div class="activated-stat">
                    <span>剩余天数</span>
                    <strong>
                        {activationResult.userInfo.isLifetime ? "永久" : activationResult.userInfo.remainingDays}
                    </strong>
                </div>
            </div>

            <div class="member-actions">
                <a
                    class="member-link primary"
                    href={TUTORIAL_URL}
                    target="_blank"
                    rel="noopener noreferrer">查看插件教程</a
                >
                <a
                    class="member-link"
                    href={MEMBER_GROUP_URL}
                    target="_blank"
                    rel="noopener noreferrer">加入主页插件会员群</a
                >
            </div>

            <div class="member-group-card">
                <div>
                    <span>主页插件会员群</span>
                    <strong>群号：{MEMBER_GROUP_NUMBER}</strong>
                </div>
                <p>群内会同步教程、常见问题和会员相关说明，也欢迎交流你的主页配置思路。</p>
            </div>

            {#if activationResult.legacyDeprecated}
                <div class="legacy-license-warning">
                    ⚠️ 当前使用的是旧版激活码。激活方式已更换，请联系作者换发新版激活码。
                    旧版激活方式将只兼容到 2026 年 8 月 31 日。
                </div>
            {/if}
            <button class="deactivate-button" onclick={onDeactivate}>注销激活</button>
        </div>
    {:else}
        <div class="vip-activate">
            <h2>👑 VIP 激活</h2>
            <h3>
                <a
                    href="https://blog.glaube-ty.top/archives/019d3f20-03d4-70fd-8afe-dff8bb2107ab"
                    target="_blank"
                    class="vip-benefits-link">👑查看会员权益👑</a
                >
            </h3>
            {#if USER_NAME || USER_ID}
                {@const primaryUserCode = USER_CODE_V2 || USER_CODE}
                <label for="">购买或换发激活码时，请复制下方会员识别码发送给作者。</label>
                <div class="code-box">
                    <input
                        type="text"
                        class="user-code"
                        value={primaryUserCode}
                        readonly
                    />
                    <button
                        onclick={() => copyText(primaryUserCode, "✅ 会员识别码已复制到剪贴板")}
                        class="btn copy-button"
                        title="复制会员识别码"
                        aria-label="复制会员识别码">复制</button
                    >
                </div>
                {#if IDENTITY_SOURCE === "window.siyuan.user"}
                    <div class="identity-source-warning">
                        当前使用本地窗口账号信息作为兜底身份来源，如显示异常请重启思源或重新登录。
                    </div>
                {/if}
                <div class="purchase-plan">
                    <h4>💰 订阅方案</h4>
                    <div class="plan-card">
                        <div class="plan-item monthly">
                            <div class="plan-price">
                                <span class="new-price" style="color: var(--b3-theme-primary); font-weight: bold; font-size: 18px;">5 元</span>
                            </div>
                            <div class="plan-duration">/ 月</div>
                        </div>
                        <div class="plan-item monthly">
                            <div class="plan-price">
                                <span class="new-price" style="color: var(--b3-theme-primary); font-weight: bold; font-size: 18px;">12 元</span>
                            </div>
                            <div class="plan-duration">/ 季</div>
                        </div>
                        <div class="plan-item yearly">
                            <div class="plan-price">
                                <span class="new-price" style="color: var(--b3-theme-primary); font-weight: bold; font-size: 18px;">35 元</span>
                            </div>
                            <div class="plan-duration">/ 年</div>
                        </div>
                        <div class="plan-item permanent">
                            <div class="plan-badge">🔥 限时优惠</div>
                            <div class="plan-price">
                                <span class="old-price" style="text-decoration: line-through; color: #999; font-size: 14px; margin-right: 5px;">128 元</span>
                                <span class="new-price" style="color: #ef4444; font-weight: bold; font-size: 20px;">99 元</span>
                            </div>
                            <div class="plan-duration">永久会员</div>
                            <div class="plan-urgency">⏰ 随时恢复原价</div>
                        </div>
                    </div>
                </div>
                <div class="purchase-address">
                    <h4>🛍️ 购买地址</h4>
                    <div class="address-card">
                        <div class="address-item">
                            <span class="icon">🔗</span>
                            <div class="address-content">
                                <strong>地址：</strong>
                                <a href="https://afdian.com/a/glaube-ty">爱发电</a>
                            </div>
                        </div>
                        <div class="qrcode-container">
                            <img
                                class="qrcode"
                                src="https://glaube-ty.oss-cn-chengdu.aliyuncs.com/img/afdian-Glaube_TY.jpg"
                                alt="爱发电二维码"
                            />
                        </div>
                    </div>
                </div>
                <div class="reminder">
                    <div class="reminder-card">
                        <div class="reminder-item">
                            <span class="icon">💬</span>
                            <p>工作日 09:00 - 22:00 回复会比较快，其他时候看到会第一时间处理。</p>
                        </div>
                        <div class="reminder-item">
                            <span class="icon">💡</span>
                            <p>虚拟产品购买后不支持退款！</p>
                        </div>
                        <div class="reminder-item">
                            <span class="icon">🎓</span>
                            <p>
                                如果你是学生的话，可以使用学校教育邮箱发送邮件至
                                <a href="mailto:glaube_ty@qq.com">glaube_ty@qq.com</a>
                                ，赠送一年会员哦，记得附上会员识别码~
                            </p>
                        </div>
                        <div class="reminder-item">
                            <span class="icon">🎁</span>
                            <p>若在插件 2.0 版本前打赏过，可将打赏订单号及会员识别码发送至下方邮箱或联系频道管理员，赠送一年 VIP。</p>
                        </div>
                    </div>
                </div>
                <div class="purchase-question">
                    <h4>❓ 问题咨询</h4>
                    <div class="question-card">
                        <div class="question-item">
                            <span class="icon">📧</span>
                            <div class="question-content">
                                <strong>邮箱：</strong>
                                <a href="mailto:glaube_ty@qq.com">glaube_ty@qq.com</a>
                            </div>
                        </div>
                        <div class="question-item">
                            <span class="icon">💬</span>
                            <div class="question-content">
                                <strong>腾讯频道：(订阅问题请私信管理员)</strong>
                                <a href="https://pd.qq.com/s/2ks4079x0">SY 插件交流频道</a>
                            </div>
                        </div>
                    </div>
                </div>
                <label for="">激活码：<textarea value={ActivationCode} oninput={(e) => onActivationCodeChange(e.currentTarget.value)}></textarea></label>
                <div class="btn-group">
                    <button onclick={onActivate}>激活</button>
                </div>
            {:else}
                <label for="">由于会员功能与账号绑定，<br />请先登录后进行查看！</label>
            {/if}
        </div>
    {/if}
</div>
