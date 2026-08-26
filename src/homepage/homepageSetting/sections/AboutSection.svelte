<script lang="ts">
    import Heart from "@lucide/svelte/icons/heart";
</script>

<div class="about-section">
    <div class="about-header">
        <h3>🏠 思源主页插件</h3>
        <p class="motto">提供个性化首页布局和丰富的功能模块。</p>
    </div>

    <div class="about-grid">
        <!-- 插件主页 -->
        <div class="about-card">
            <span class="icon">🌐</span>
            <div class="card-content">
                <span class="label">插件主页</span>
                <div class="link-list">
                    <a href="https://glaube-ty.top/sites/siyuan-homepage/index.html" class="link">插件官网</a>
                    <a href="https://github.com/Glaube-TY/siyuan-homepage" class="link">GitHub 项目</a>
                </div>
            </div>
        </div>

        <!-- 插件教程 -->
        <div class="about-card">
            <span class="icon">📜</span>
            <div class="card-content">
                <span class="label">插件教程</span>
                <div class="link-list">
                    <a href="https://glaube-ty.top/tutorials/siyuan-homepage/" class="link">查看教程</a>
                </div>
            </div>
        </div>

        <!-- 开发者 -->
        <div class="about-card">
            <span class="icon">👨</span>
            <div class="card-content">
                <span class="label">开发者：Glaube-TY</span>
                <div class="link-list">
                    <a href="https://github.com/Glaube-TY" class="link">Github 主页</a>
                    <a href="https://ld246.com/member/GlaubeTY" class="link">链滴主页</a>
                </div>
            </div>
        </div>

        <!-- 反馈建议 -->
        <div class="about-card">
            <span class="icon">⁉</span>
            <div class="card-content">
                <span class="label">反馈 & 建议</span>
                <div class="link-list">
                    <a href="https://github.com/Glaube-TY/siyuan-homepage/issues" class="link">Github Issues</a>
                    <a href="https://pd.qq.com/s/2ks4079x0" class="link">腾讯频道</a>
                </div>
            </div>
        </div>

        <!-- 赞助支持 -->
        <div class="about-card support-card">
            <span class="icon">🌹</span>
            <div class="card-content">
                <span class="label">您的支持是持续开发的动力！</span>
                <div class="link-list">
                    <a href="https://glaube-ty.top/da-shang/" class="link support-link">
                        <Heart size={16} />
                        立即赞助
                        <span class="sparkle">✨</span>
                    </a>
                </div>
            </div>
        </div>
    </div>

    <div class="about-footer">
        <p>❤ 感谢您使用本插件，希望您享受更高效的知识管理体验！</p>
    </div>
</div>
