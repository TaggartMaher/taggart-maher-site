<script lang="ts">
  import Link from "../../router/Link.svelte";
  import Markdown from "../../portfolio/content/Markdown.svelte";
  import { BLOG_POSTS } from "../../portfolio/content/blog";
  import CopyLinkButton from "../../shared/CopyLinkButton.svelte";
  import NotFoundPage from "./NotFoundPage.svelte";

  let { postId }: { postId: string } = $props();

  const post = $derived(BLOG_POSTS.find((entry) => entry.id === postId));
</script>

{#if !post}
  <NotFoundPage />
{:else}
  <article class="lite-page">
    <Link to="/blog" class="lite-detail-back">← all posts</Link>
    <p class="lite-detail-meta">
      {post.icon ? post.icon + " " : ""}{post.tag} · {post.date} · {post.readtime}
    </p>
    <h1>{post.title}</h1>
    <Markdown html={post.content} />
    {#if post.links && post.links.length > 0}
      <h3>Links</h3>
      <ul class="lite-link-list">
        {#each post.links as link (link.label)}
          <li>
            <a href={link.href}>
              <span class="lite-link-name">{link.label}</span>
              <span class="lite-link-hint">↗</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
    <CopyLinkButton />
  </article>
{/if}
