<script lang="ts">
  interface StatusbarProps {
    count: number;
    hint: string;
  }

  let { count, hint }: StatusbarProps = $props();
</script>

<div class="statusbar mono">
  <span>{count} items</span>
  <span>{hint}</span>
</div>
