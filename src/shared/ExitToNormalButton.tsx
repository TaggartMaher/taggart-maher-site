import "./exitToNormalButton.css";

export function ExitToNormalButton() {
  function handleClick(): void {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "fallback");
    window.location.assign(url.toString());
  }

  return (
    <button type="button" className="exit-to-normal-button" onClick={handleClick}>
      Exit to normal website
    </button>
  );
}
