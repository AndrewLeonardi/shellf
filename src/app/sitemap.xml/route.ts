import prisma from '@/lib/db';

interface SitemapPage {
  url: string;
  priority: string;
  changefreq: string;
  lastmod?: string;
}

export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://shellf.ai';

  // Get all books for dynamic URLs
  const books = await prisma.book.findMany({
    where: { available: true },
    select: { id: true, ingestedAt: true },
  });

  // Get all agents
  const agents = await prisma.agent.findMany({
    select: { agentId: true, registeredAt: true },
  });

  const staticPages: SitemapPage[] = [
    { url: '', priority: '1.0', changefreq: 'daily' },
    { url: '/browse', priority: '0.9', changefreq: 'daily' },
    { url: '/docs', priority: '0.8', changefreq: 'weekly' },
    { url: '/terms', priority: '0.3', changefreq: 'monthly' },
  ];

  const bookPages: SitemapPage[] = books.map((book) => ({
    url: `/book/${book.id}`,
    lastmod: book.ingestedAt?.toISOString() || new Date().toISOString(),
    priority: '0.7',
    changefreq: 'weekly',
  }));

  const agentPages: SitemapPage[] = agents.map((agent) => ({
    url: `/agent/${agent.agentId}`,
    lastmod: agent.registeredAt.toISOString(),
    priority: '0.6',
    changefreq: 'weekly',
  }));

  const allPages: SitemapPage[] = [...staticPages, ...bookPages, ...agentPages];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (page) => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    ${page.lastmod ? `<lastmod>${page.lastmod}</lastmod>` : ''}
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(sitemap, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
