<script lang="ts">
    import { showMessage } from "siyuan";

    interface Props {
        USER_NAME: string;
        USER_ID: string;
        USER_CODE: string;
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
        activated,
        activationResult,
        ActivationCode,
        onDeactivate,
        onActivate,
        onActivationCodeChange
    }: Props = $props();
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
        <div class="activated">
            <h2>👑当前用户已激活👑</h2>
            <label for="">到期时间：{activationResult.userInfo.due}</label>
            <label for="">剩余天数：{activationResult.userInfo.remainingDays}</label>
            <button onclick={onDeactivate}>注销激活</button>
        </div>
    {:else}
        <div class="vip-activate">
            <h2>👑 VIP 激活</h2>
            <h3>
                <a
                    href="https://blog.glaube-ty.top/archives/019d3f20-03d4-70fd-8afe-dff8bb2107ab"
                    target="_blank">👑查看会员权益👑</a
                >
            </h3>
            {#if USER_NAME || USER_ID}
                <label for="">购买时，请将下列标识码附在留言区域：</label>
                <div class="code-box">
                    <input
                        type="text"
                        class="user-code"
                        value={USER_CODE}
                        readonly
                    />
                    <button
                        onclick={() => {
                            navigator.clipboard
                                .writeText(USER_CODE)
                                .then(() => {
                                    showMessage("✅ 用户标识码已复制到剪贴板");
                                })
                                .catch((err) => {
                                    console.error("复制失败", err);
                                });
                        }}
                        class="btn copy-button"
                        title="复制用户标识码"
                        aria-label="复制用户标识码">复制</button
                    >
                </div>
                <div class="purchase-plan">
                    <h4>💰 订阅方案</h4>
                    <div class="plan-card">
                        <div class="plan-item monthly">
                            <div class="plan-price">
                                <span class="old-price" style="text-decoration: line-through; color: #999; font-size: 14px; margin-right: 5px;">8 元</span>
                                <span class="new-price" style="color: var(--b3-theme-primary); font-weight: bold; font-size: 18px;">5 元</span>
                            </div>
                            <div class="plan-duration">/ 月</div>
                        </div>
                        <div class="plan-item monthly">
                            <div class="plan-price">
                                <span class="old-price" style="text-decoration: line-through; color: #999; font-size: 14px; margin-right: 5px;">20 元</span>
                                <span class="new-price" style="color: var(--b3-theme-primary); font-weight: bold; font-size: 18px;">12 元</span>
                            </div>
                            <div class="plan-duration">/ 季</div>
                        </div>
                        <div class="plan-item yearly">
                            <div class="plan-price">
                                <span class="old-price" style="text-decoration: line-through; color: #999; font-size: 14px; margin-right: 5px;">69 元</span>
                                <span class="new-price" style="color: var(--b3-theme-primary); font-weight: bold; font-size: 18px;">35 元</span>
                            </div>
                            <div class="plan-duration">/ 年</div>
                        </div>
                    </div>
                    <p>以后大概率会保持目前的降价价格，若最近有原价购买过会员的用户且还在会员期内，可以在爱发电私信我，根据用户情况赠送增加相应的天数。</p>
                    <p>感谢大家的支持~</p>
                    <p>调整时间：2026年3月15日</p>
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
                            <span class="icon">🎁</span>
                            <p>若在插件 2.0 版本前打赏过，可将打赏订单号及标识码发送至下方邮箱或联系频道管理员，赠送一年 VIP。</p>
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
                                <a href="https://pd.qq.com/s/2ks4079x0">思源笔记主页插件</a>
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