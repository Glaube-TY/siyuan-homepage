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
      title="标题路径命中权重"
      description="标题路径包含关键词时的加分权重（范围：0–50，默认 10，设为 0 表示关闭加权）"
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
      description="正文内容包含关键词时的加分权重（范围：0–50，默认 5，设为 0 表示关闭加权）"
      direction="column"
    >
      <Form.Input
        type="number"
        key="textMatchWeight"
        bind:value={settings.textMatchWeight}
        fnSize={false}
      />
    </Form.Wrap>

    <Form.Wrap
      title="预览命中权重"
      description="预览内容包含关键词时的加分权重（范围：0–50，默认 3，设为 0 表示关闭加权）"
      direction="column"
    >
      <Form.Input
        type="number"
        key="previewMatchWeight"
        bind:value={settings.previewMatchWeight}
        fnSize={false}
      />
    </Form.Wrap>
  </div>

  <!-- 上下文构建参数分组 -->
  <div class="settings-group">
    <h3 class="group-title">上下文构建参数</h3>

    <Form.Wrap
      title="最大上下文条数"
      description="构建 QA 上下文时最多使用的条数（范围：1–10，默认 5）"
      direction="column"
    >
      <Form.Input
        type="number"
        key="maxContextItems"
        bind:value={settings.maxContextItems}
        fnSize={false}
      />
    </Form.Wrap>

    <Form.Wrap
      title="单条上下文最大长度"
      description="每条上下文内容的最大字符数（范围：200–12000，默认 800）"
      direction="column"
    >
      <Form.Input
        type="number"
        key="maxContextTextLength"
        bind:value={settings.maxContextTextLength}
        fnSize={false}
      />
    </Form.Wrap>
  </div>
</div>

<style lang="scss">
  .retrieval-settings-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .settings-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-title {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--b3-border-color);
  }
</style>
