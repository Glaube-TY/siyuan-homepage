<script lang="ts">
  import Form from "@/libs/components/Form";
  import type { KbSettings } from "../../../types/settings";

  export let settings: KbSettings;
</script>

<div class="retrieval-settings-tab">
  <!-- 检索召回参数分组 -->
  <div class="settings-group">
    <h3 class="group-title">检索召回参数</h3>

    <Form.Wrap
      title="最大返回条数"
      description="关键词检索阶段最多返回的候选条数（范围：1–100，默认 50）"
      direction="column"
    >
      <Form.Input
        type="number"
        key="firstPassMaxHits"
        bind:value={settings.firstPassMaxHits}
        fnSize={false}
      />
    </Form.Wrap>

    <Form.Wrap
      title="文档标题命中权重"
      description="文档名包含关键词时的加分权重，关联性最强。（范围：0–50，默认 20，设为 0 表示关闭加权）"
      direction="column"
    >
      <Form.Input
        type="number"
        key="docTitleMatchWeight"
        bind:value={settings.docTitleMatchWeight}
        fnSize={false}
      />
    </Form.Wrap>

    <Form.Wrap
      title="正文标题命中权重"
      description="正文标题块包含关键词时的加分权重。（范围：0–50，默认 10，设为 0 表示关闭加权）"
      direction="column"
    >
      <Form.Input
        type="number"
        key="headingMatchWeight"
        bind:value={settings.headingMatchWeight}
        fnSize={false}
      />
    </Form.Wrap>

    <Form.Wrap
      title="正文命中权重"
      description="正文段落、列表、表格、代码等内容包含关键词时的加分权重。（范围：0–50，默认 5，设为 0 表示关闭加权）"
      direction="column"
    >
      <Form.Input
        type="number"
        key="textMatchWeight"
        bind:value={settings.textMatchWeight}
        fnSize={false}
      />
    </Form.Wrap>


  </div>

  <!-- 文档读取参数分组 -->
  <div class="settings-group">
    <h3 class="group-title">文档读取参数</h3>

    <Form.Wrap
      title="单次读取文档字符数"
      description="AI 单次读取本地文档时，每篇文档最多返回的字符数。值越大，单次读取越完整，但上下文占用越高。（范围：2000-100000，默认 12000）"
      direction="column"
    >
      <Form.Input
        type="number"
        key="agentReadMaxCharsPerDoc"
        bind:value={settings.agentReadMaxCharsPerDoc}
        fnSize={false}
      />
    </Form.Wrap>
  </div>
</div>

<style lang="scss">
  @use '../_kb-tokens' as *;

  .retrieval-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: $kb-space-3xl;
  }

  .settings-group {
    display: flex;
    flex-direction: column;
    gap: $kb-space-sm;
  }

  .group-title {
    margin: 0 0 $kb-space-sm 0;
    font-size: $kb-fs-lg;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    padding-bottom: $kb-space-sm;
    border-bottom: 1px solid var(--b3-border-color);
  }
</style>
