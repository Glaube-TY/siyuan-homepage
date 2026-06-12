<script lang="ts">
  /**
   * Pure diff content — renders EditDiffViewer only.
   * Buttons are handled by the standard Dialog .b3-dialog__action area.
   */
  import type { EditDiffPreview } from "../../services/doc-content-edit/doc-content-edit-types";
  import EditDiffViewer from "./edit-diff-viewer.svelte";

  export let editDiffPreview: EditDiffPreview | null = null;
</script>

<div class="eddc-content">
  <EditDiffViewer {editDiffPreview} />
</div>

<style>
  .eddc-content {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
</style>
