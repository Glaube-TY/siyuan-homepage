<script lang="ts">
  import type { KbSettings } from "../../../types/settings";
  import ModelProviderManager from "./model-provider-manager.svelte";

  export let settings: KbSettings;
</script>

<div class="model-settings-tab">
  <!-- 聊天模型配置 -->
  <div class="section">
    <ModelProviderManager bind:settings />
  </div>
</div>

<style lang="scss">
  .model-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
</style>
