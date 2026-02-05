/**
 * Project Gutenberg API Client
 *
 * Uses gutendex.com API to fetch book metadata and text
 * https://gutendex.com/
 */

const GUTENDEX_API = process.env.GUTENBERG_API || 'https://gutendex.com';

export interface GutenbergBook {
  id: number;
  title: string;
  authors: {
    name: string;
    birth_year: number | null;
    death_year: number | null;
  }[];
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  copyright: boolean;
  media_type: string;
  formats: {
    [key: string]: string;
  };
  download_count: number;
}

export interface GutenbergSearchResult {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutenbergBook[];
}

/**
 * Search for books in the Gutenberg catalog
 */
export async function searchGutenberg(params: {
  search?: string;
  topic?: string;
  languages?: string;
  page?: number;
}): Promise<GutenbergSearchResult> {
  const url = new URL(`${GUTENDEX_API}/books`);

  if (params.search) url.searchParams.set('search', params.search);
  if (params.topic) url.searchParams.set('topic', params.topic);
  if (params.languages) url.searchParams.set('languages', params.languages);
  if (params.page) url.searchParams.set('page', params.page.toString());

  const res = await fetch(url.toString());

  if (!res.ok) {
    throw new Error(`Gutendex API error: ${res.status}`);
  }

  return res.json();
}

/**
 * Get a specific book by Gutenberg ID
 */
export async function getGutenbergBook(gutenbergId: number): Promise<GutenbergBook | null> {
  const res = await fetch(`${GUTENDEX_API}/books/${gutenbergId}`);

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Gutendex API error: ${res.status}`);
  }

  return res.json();
}

/**
 * Get the plain text URL for a book
 * Prefers UTF-8 text, falls back to ASCII
 */
export function getTextUrl(book: GutenbergBook): string | null {
  const formats = book.formats;

  // Prefer UTF-8 plain text
  if (formats['text/plain; charset=utf-8']) {
    return formats['text/plain; charset=utf-8'];
  }

  // Fall back to ASCII plain text
  if (formats['text/plain; charset=us-ascii']) {
    return formats['text/plain; charset=us-ascii'];
  }

  // Try any plain text format
  for (const [format, url] of Object.entries(formats)) {
    if (format.startsWith('text/plain')) {
      return url;
    }
  }

  return null;
}

/**
 * Get the cover image URL for a book
 */
export function getCoverUrl(book: GutenbergBook): string | null {
  const formats = book.formats;

  // Try JPEG first
  if (formats['image/jpeg']) {
    return formats['image/jpeg'];
  }

  // Try PNG
  if (formats['image/png']) {
    return formats['image/png'];
  }

  // Fallback to Open Library cover
  // https://covers.openlibrary.org/b/id/{cover_id}-L.jpg
  return null;
}

/**
 * Fetch the raw text of a book
 */
export async function fetchBookText(textUrl: string): Promise<string> {
  const res = await fetch(textUrl);

  if (!res.ok) {
    throw new Error(`Failed to fetch book text: ${res.status}`);
  }

  return res.text();
}

/**
 * Clean Gutenberg text by removing header and footer boilerplate
 */
export function cleanGutenbergText(text: string): string {
  // Find the start of the actual content
  // Gutenberg books typically start with "*** START OF"
  const startPatterns = [
    /\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG EBOOK/i,
    /\*\*\*\s*START OF PROJECT GUTENBERG/i,
    /\*\*\* START OF THIS PROJECT GUTENBERG/i,
  ];

  let startIndex = 0;
  for (const pattern of startPatterns) {
    const match = text.search(pattern);
    if (match !== -1) {
      // Find the end of this line
      const lineEnd = text.indexOf('\n', match);
      startIndex = lineEnd !== -1 ? lineEnd + 1 : match;
      break;
    }
  }

  // Find the end of the actual content
  const endPatterns = [
    /\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG EBOOK/i,
    /\*\*\*\s*END OF PROJECT GUTENBERG/i,
    /End of (the )?Project Gutenberg/i,
  ];

  let endIndex = text.length;
  for (const pattern of endPatterns) {
    const match = text.search(pattern);
    if (match !== -1) {
      endIndex = match;
      break;
    }
  }

  // Extract the content
  let content = text.slice(startIndex, endIndex);

  // Clean up excessive whitespace
  content = content
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  return content;
}

/**
 * Extract normalized genres from Gutenberg subjects and bookshelves
 */
export function extractGenres(book: GutenbergBook): string[] {
  const genres = new Set<string>();

  const genreMap: { [key: string]: string } = {
    'fiction': 'Fiction',
    'science fiction': 'Science Fiction',
    'mystery': 'Mystery',
    'detective': 'Mystery',
    'romance': 'Romance',
    'adventure': 'Adventure',
    'horror': 'Horror',
    'fantasy': 'Fantasy',
    'philosophy': 'Philosophy',
    'history': 'History',
    'biography': 'Biography',
    'poetry': 'Poetry',
    'drama': 'Drama',
    'children': 'Children\'s',
    'humor': 'Humor',
    'satire': 'Satire',
    'politics': 'Politics',
    'psychology': 'Psychology',
    'religion': 'Religion',
    'science': 'Science',
    'nature': 'Nature',
    'travel': 'Travel',
    'war': 'War',
    'social': 'Social Commentary',
    'classic': 'Classic',
    'literary': 'Literary Fiction',
  };

  const allTags = [...book.subjects, ...book.bookshelves].map(s => s.toLowerCase());

  for (const tag of allTags) {
    for (const [keyword, genre] of Object.entries(genreMap)) {
      if (tag.includes(keyword)) {
        genres.add(genre);
      }
    }
  }

  // Default to Fiction if no specific genre found
  if (genres.size === 0) {
    genres.add('Fiction');
  }

  return Array.from(genres).slice(0, 5); // Max 5 genres
}
