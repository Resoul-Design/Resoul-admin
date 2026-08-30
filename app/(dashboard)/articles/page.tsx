import { shopifyGraphQL } from "@/lib/shopify";

export const dynamic = "force-dynamic";

type BlogsResp = {
  blogs: {
    edges: {
      node: {
        id: string;
        title: string;
        handle: string;
        articles: {
          edges: {
            node: {
              id: string;
              title: string;
              handle: string;
              publishedAt: string | null;
              author: { name: string | null } | null;
              body: string | null;
            };
          }[];
        };
      };
    }[];
  };
};

const QUERY = `{
  blogs(first: 5) {
    edges { node {
      id title handle
      articles(first: 30) {
        edges { node { id title handle publishedAt author { name } body } }
      }
    } }
  }
}`;

export default async function ArticlesPage() {
  let data: BlogsResp | null = null;
  let err = "";
  try {
    data = await shopifyGraphQL<BlogsResp>(QUERY);
  } catch (e) {
    err = String(e);
  }

  const blogs = data?.blogs.edges.map((e) => e.node) ?? [];
  const totalArticles = blogs.reduce((n, b) => n + b.articles.edges.length, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">文章記錄</h1>

      {err && (
        <div className="rounded-2xl border border-red-300 bg-[var(--card)] p-6 text-sm text-red-600">
          讀取 Shopify 失敗：{err}
        </div>
      )}

      {!err && totalArticles === 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無文章。
        </div>
      )}

      {blogs.map((b) =>
        b.articles.edges.length === 0 ? null : (
          <div key={b.id} className="mb-6">
            <h2 className="text-sm font-medium text-[var(--gold)] mb-2">
              {b.title}
            </h2>
            <div className="space-y-2">
              {[...b.articles.edges]
                .sort((x, y) =>
                  (y.node.publishedAt || "").localeCompare(x.node.publishedAt || "")
                )
                .map((a) => (
                  <details
                    key={a.node.id}
                    className="rounded-2xl border border-[var(--line)] bg-[var(--card)] group"
                  >
                    <summary className="cursor-pointer list-none px-4 py-3.5 flex items-center gap-3">
                      <span className="text-[var(--gold)] text-xs transition-transform group-open:rotate-90">
                        ▶
                      </span>
                      <span className="font-medium">{a.node.title}</span>
                      <span className="ml-auto text-xs text-[var(--soft)] whitespace-nowrap">
                        {a.node.author?.name || "—"}
                        {a.node.publishedAt
                          ? "　·　" + a.node.publishedAt.slice(0, 10)
                          : "　·　未發佈"}
                      </span>
                    </summary>
                    <div className="px-4 pb-4 border-t border-[var(--line)] pt-3">
                      <div
                        className="article-body max-h-[420px] overflow-y-auto pr-1"
                        dangerouslySetInnerHTML={{
                          __html: a.node.body || "（沒有內容）",
                        }}
                      />
                    </div>
                  </details>
                ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
