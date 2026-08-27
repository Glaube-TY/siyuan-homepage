<script lang="ts">
    import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
    import BookOpen from "@lucide/svelte/icons/book-open";
    import Globe from "@lucide/svelte/icons/globe";
    import Heart from "@lucide/svelte/icons/heart";
    import House from "@lucide/svelte/icons/house";
    import MessageCircle from "@lucide/svelte/icons/message-circle";
    import QrCode from "@lucide/svelte/icons/qr-code";
    import UserRound from "@lucide/svelte/icons/user-round";

    const COMMUNITY_GROUP_URL = "https://qm.qq.com/q/uVcJ5zLyGQ";
    const COMMUNITY_GROUP_QR_URL = "https://glaube-ty.oss-cn-chengdu.aliyuncs.com/img/QQGroup.jpg";
    const COMMUNITY_GROUP_NUMBER = "1080145391";
</script>

<div class="about-section">
    <header class="about-hero" aria-labelledby="about-title">
        <span class="about-hero-mark" aria-hidden="true"><House size={26} /></span>
        <div class="about-header-copy">
            <h3 id="about-title">思源主页插件</h3>
            <p class="motto">提供个性化首页布局和丰富的功能模块。</p>
        </div>
        <div class="about-hero-note" aria-label="插件作者">
            <span>ABOUT</span>
            <strong>Glaube-TY</strong>
        </div>
    </header>

    <main class="about-main">
        <section class="about-resources" aria-labelledby="resources-title">
            <div class="section-heading">
                <div>
                    <h4 id="resources-title">资源与入口</h4>
                    <p>从这里了解插件、教程和项目动态。</p>
                </div>
                <span class="section-heading-mark" aria-hidden="true">↗</span>
            </div>

            <div class="resource-list">
                <article class="resource-row">
                    <span class="resource-icon" aria-hidden="true"><Globe size={19} /></span>
                    <div class="resource-copy">
                        <h5>插件主页</h5>
                        <p>官网与项目入口</p>
                    </div>
                    <div class="resource-actions">
                        <a href="https://glaube-ty.top/sites/siyuan-homepage/index.html" class="resource-link">
                            插件官网 <ArrowUpRight size={15} aria-hidden="true" />
                        </a>
                        <a href="https://github.com/Glaube-TY/siyuan-homepage" class="resource-link">
                            GitHub 项目 <ArrowUpRight size={15} aria-hidden="true" />
                        </a>
                    </div>
                </article>

                <article class="resource-row">
                    <span class="resource-icon" aria-hidden="true"><BookOpen size={19} /></span>
                    <div class="resource-copy">
                        <h5>插件教程</h5>
                        <p>从基础设置到进阶用法</p>
                    </div>
                    <div class="resource-actions">
                        <a href="https://glaube-ty.top/tutorials/siyuan-homepage/" class="resource-link">
                            查看教程 <ArrowUpRight size={15} aria-hidden="true" />
                        </a>
                    </div>
                </article>

                <article class="resource-row">
                    <span class="resource-icon" aria-hidden="true"><UserRound size={19} /></span>
                    <div class="resource-copy">
                        <h5>开发者</h5>
                        <p>关注 Glaube-TY 的项目更新</p>
                    </div>
                    <div class="resource-actions">
                        <a href="https://github.com/Glaube-TY" class="resource-link">
                            GitHub 主页 <ArrowUpRight size={15} aria-hidden="true" />
                        </a>
                        <a href="https://ld246.com/member/GlaubeTY" class="resource-link">
                            链滴主页 <ArrowUpRight size={15} aria-hidden="true" />
                        </a>
                    </div>
                </article>

                <article class="resource-row">
                    <span class="resource-icon" aria-hidden="true"><MessageCircle size={19} /></span>
                    <div class="resource-copy">
                        <h5>反馈 &amp; 建议</h5>
                        <p>提交问题，也欢迎分享你的使用方式</p>
                    </div>
                    <div class="resource-actions">
                        <a href="https://github.com/Glaube-TY/siyuan-homepage/issues" class="resource-link">
                            Github Issues <ArrowUpRight size={15} aria-hidden="true" />
                        </a>
                    </div>
                </article>
            </div>
        </section>

        <aside class="community-panel" aria-labelledby="community-title">
            <div class="community-copy">
                <h4 id="community-title">加入通用 QQ 群</h4>
                <p>反馈问题、分享布局，也欢迎和其他思源用户交流。</p>
                <div class="community-number">
                    <span>群号</span>
                    <strong>{COMMUNITY_GROUP_NUMBER}</strong>
                    <a href={COMMUNITY_GROUP_URL} class="community-link" target="_blank" rel="noopener noreferrer">
                        点击加入群聊 <ArrowUpRight size={15} aria-hidden="true" />
                    </a>
                </div>
            </div>
            <div class="community-visual">
                <div class="community-qr-frame">
                    <img
                        class="community-qr"
                        src={COMMUNITY_GROUP_QR_URL}
                        alt="思源笔记插件交流 QQ 群二维码"
                        loading="lazy"
                    />
                </div>
                <span class="community-qr-caption">
                    <QrCode size={14} aria-hidden="true" /> 扫码加入
                </span>
            </div>
        </aside>
    </main>

    <section class="about-support" aria-labelledby="support-title">
        <span class="support-icon" aria-hidden="true"><Heart size={22} /></span>
        <div class="support-copy">
            <h4 id="support-title">支持持续开发</h4>
            <p>如果它让思源更好用了，欢迎请作者喝杯咖啡。</p>
        </div>
        <a href="https://glaube-ty.top/da-shang/" class="support-link">
            立即赞助 <ArrowUpRight size={15} aria-hidden="true" />
        </a>
    </section>

    <footer class="about-footer">
        <span class="footer-rule" aria-hidden="true"></span>
        <p>感谢您使用本插件，希望您享受更高效的知识管理体验。</p>
        <span class="footer-rule" aria-hidden="true"></span>
    </footer>
</div>
