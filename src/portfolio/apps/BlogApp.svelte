<script lang="ts">
  import CopyLinkButton from "../../shared/CopyLinkButton.svelte";
  import { BLOG_POSTS } from "../content/blog";
  import Markdown from "../content/Markdown.svelte";
  import { getBlogSelection } from "./appsContext";
  import Sidebar from "./Sidebar.svelte";
  import Toolbar from "./Toolbar.svelte";

  const posts = BLOG_POSTS;
  const selection = getBlogSelection();
  const selected = $derived(
    selection.selectedId ? posts.find((post) => post.id === selection.selectedId) : null,
  );
</script>

<div class={"dol" + (selected ? " focus" : "")}>
  <Toolbar path={"/home/taggart/Blog" + (selected ? "/" + selected.id + ".md" : "")}>
    {#snippet right()}
      {#if selected}
        <div class="vw-toggle mono">
          <CopyLinkButton />
        </div>
      {/if}
    {/snippet}
  </Toolbar>
  <div class="dol-body">
    <Sidebar active="blog" />
    <div class="doc-pad">
      {#if selected}
        <article>
          <button
            type="button"
            class="focus-bar back mono"
            onclick={() => selection.setSelectedId(null)}
          >
            ‹ Back to Article List
          </button>
          <div class="post-h">
            <span class="post-tag mono">
              {selected.icon ? selected.icon + " " : ""}{selected.tag}
            </span>
            <span class="post-meta mono">{selected.date} · {selected.readtime}</span>
          </div>
          <Markdown html={selected.content} />
          {#if selected.links && selected.links.length > 0}
            <div class="detail-links">
              {#each selected.links as link (link.label)}
                <a class="btn-go mono" href={link.href}>{link.label} ↗</a>
              {/each}
            </div>
          {/if}
        </article>
      {:else}
        <h1 class="serif">Blog</h1>
        <p class="lede">Posts. Some technical, some less so.</p>
        <ul class="post-list">
          {#each posts as post (post.id)}
            <li class="post">
              <button
                type="button"
                class="post-link"
                onclick={() => selection.setSelectedId(post.id)}
              >
                <div class="post-h">
                  <span class="post-tag mono">
                    {post.icon ? post.icon + " " : ""}{post.tag}
                  </span>
                  <span class="post-meta mono">{post.year} · {post.readtime}</span>
                </div>
                <h3 class="serif">{post.title}</h3>
                <p class="post-ex">{post.excerpt}</p>
                <div class="post-go mono">read post →</div>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>
