---
name: svelte-astro
description: >
  Svelte 5 and Astro 5 patterns for modern web apps.
  Trigger: When writing Svelte components, when building with Astro, when using SvelteKit, when working with .svelte or .astro files.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

Load this skill when:
- Writing Svelte 5 components with runes ($state, $derived, $effect)
- Building Astro 5 pages and components
- Using SvelteKit for routing and SSR
- Integrating Svelte components in Astro
- Working with `.svelte` or `.astro` files

## Svelte 5 Runes (REQUIRED)

Svelte 5 uses runes instead of reactive declarations. Never use `$:` or `let` for reactive state.

```svelte
<!-- GOOD: Svelte 5 runes -->
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);

  function increment() {
    count++;
  }

  $effect(() => {
    console.log('Count changed:', count);
  });
</script>

<button onclick={increment}>
  Count: {count}, Doubled: {doubled}
</button>
```

```svelte
<!-- BAD: Svelte 4 syntax (deprecated) -->
<script>
  let count = 0;
  $: doubled = count * 2;

  function increment() {
    count++;
  }

  $: console.log('Count changed:', count);
</script>
```

## Svelte 5 Props

```svelte
<!-- GOOD: Props with $props() -->
<script>
  let { title, items = [], onSelect } = $props();
</script>

<h1>{title}</h1>
<ul>
  {#each items as item}
    <li onclick={() => onSelect(item)}>{item.name}</li>
  {/each}
</ul>
```

```svelte
<!-- BAD: Old export let syntax -->
<script>
  export let title;
  export let items = [];
</script>
```

## Svelte 5 Bindings

```svelte
<script>
  let name = $state('');
  let agreed = $state(false);
  let selected = $state('');
</script>

<!-- Two-way binding -->
<input bind:value={name} />
<input type="checkbox" bind:checked={agreed} />
<select bind:value={selected}>
  <option value="a">A</option>
  <option value="b">B</option>
</select>
```

## Astro Pages

```astro
---
// src/pages/index.astro
import Layout from '../layouts/Layout.astro';
import Card from '../components/Card.astro';

const posts = await fetch('https://api.example.com/posts').then(r => r.json());
---

<Layout title="Home">
  <h1>Welcome</h1>
  <div class="grid">
    {posts.map(post => (
      <Card title={post.title} body={post.body} />
    ))}
  </div>
</Layout>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }
</style>
```

## Astro Components

```astro
---
// src/components/Card.astro
interface Props {
  title: string;
  body?: string;
}

const { title, body } = Astro.props;
---

<article class="card">
  <h3>{title}</h3>
  {body && <p>{body}</p>}
  <slot />  <!-- children -->
</article>

<style>
  .card {
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 1rem;
  }
</style>
```

## Svelte in Astro

```astro
---
// Astro page with Svelte component
import Counter from '../components/Counter.svelte';
---

<Layout title="Svelte in Astro">
  <Counter initialCount={5} client:load />
</Layout>
```

**Client directives**:
- `client:load` — hydrate immediately
- `client:idle` — hydrate when browser is idle
- `client:visible` — hydrate when visible
- `client:media` — hydrate when media query matches
- `client:only` — only render on client (skip SSR)

## SvelteKit Routing

```
src/routes/
  +page.svelte           # /
  +page.server.ts        # server load for /
  +layout.svelte         # layout for all routes
  +layout.server.ts      # server load for layout
  +error.svelte          # error page
  about/
    +page.svelte         # /about
  blog/
    +page.svelte         # /blog
    [slug]/
      +page.svelte       # /blog/:slug
      +page.server.ts    # load for /blog/:slug
```

## SvelteKit Load Functions

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const post = await fetch(`/api/posts/${params.slug}`).then(r => r.json());

  if (!post) {
    throw error(404, 'Post not found');
  }

  return { post };
};
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script>
  let { data } = $props();
</script>

<article>
  <h1>{data.post.title}</h1>
  {@html data.post.content}
</article>
```

## SvelteKit Form Actions

```typescript
// src/routes/login/+page.server.ts
import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const email = data.get('email');
    const password = data.get('password');

    if (!email || !password) {
      return fail(400, { email, error: 'Missing fields' });
    }

    const user = await authenticate(email, password);
    if (!user) {
      return fail(400, { email, error: 'Invalid credentials' });
    }

    cookies.set('session', user.token, { path: '/' });
    redirect(303, '/dashboard');
  }
};
```

```svelte
<!-- src/routes/login/+page.svelte -->
<script>
  import { enhance } from '$app/forms';
  let { form } = $props();
</script>

<form method="POST" use:enhance>
  {#if form?.error}
    <p class="error">{form.error}</p>
  {/if}
  <input name="email" type="email" value={form?.email ?? ''} />
  <input name="password" type="password" />
  <button type="submit">Login</button>
</form>
```

## Astro Content Collections

```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };
```

```astro
---
// src/pages/blog/[...slug].astro
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map(post => ({
    params: { slug: post.slug },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content } = await post.render();
---

<article>
  <h1>{post.data.title}</h1>
  <Content />
</article>
```

## Anti-Patterns

### Don't: Use Svelte 4 syntax
```svelte
<!-- BAD -->
<script>
  let items = [];
  $: filtered = items.filter(i => i.active);
</script>

<!-- GOOD -->
<script>
  let items = $state([]);
  let filtered = $derived(items.filter(i => i.active));
</script>
```

### Don't: Hydrate everything in Astro
```astro
<!-- BAD: Hydrate static content -->
<StaticComponent client:load />

<!-- GOOD: Only hydrate interactive components -->
<InteractiveComponent client:load />
```

### Don't: Use client:* on server-rendered HTML
```astro
<!-- BAD -->
<div client:load>This is just HTML</div>

<!-- GOOD -->
<Counter client:load />
```

## References

- [Svelte 5 docs](https://svelte.dev/docs)
- [SvelteKit docs](https://kit.svelte.dev/docs)
- [Astro docs](https://docs.astro.build/)
- [Astro Svelte integration](https://docs.astro.build/en/guides/integrations-guide/svelte/)
