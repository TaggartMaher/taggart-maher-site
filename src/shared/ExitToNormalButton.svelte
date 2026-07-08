<script lang="ts">
  import "./exitToNormalButton.css";

  function handleClick(): void {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "fallback");
    window.location.assign(url.toString());
  }
</script>

<button type="button" class="exit-to-normal-button" onclick={handleClick}>
  Press for compatibility mode
</button>
