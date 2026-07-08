<script lang="ts">
  import Link from "../../router/Link.svelte";
  import { BLOG_POSTS } from "../../portfolio/content/blog";
</script>

<article class="lite-page">
  <h1>Blog</h1>
  <p class="lite-lede">My ideas, thoughts, and stories.</p>
  <ul class="lite-card-list">
    {#each BLOG_POSTS as post (post.id)}
      <li>
        <Link to={"/blog/" + post.id} class="lite-card">
          <div class="lite-card-meta">
            {post.icon ? post.icon + " " : ""}{post.tag} · {post.year} · {post.readtime}
          </div>
          <h2 class="lite-card-title">{post.title}</h2>
          <p class="lite-card-excerpt">{post.excerpt}</p>
        </Link>
      </li>
    {/each}
  </ul>
</article>
