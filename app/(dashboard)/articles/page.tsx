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
              publishedAt: string | null;
              author: { name: string | null } | null;
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
        edges { node { id title publishedAt author { name } } }
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
      <h1 className="text-2xl font-semibold mb-1">文章記錄</h1>
      <p className="text-sm text-[var(--soft)] mb-6">
        來自 Shopify Blog（照顧誌），即時讀取（共 {totalArticles} 篇）。編輯請於 Shopify 後台進行。
      </p>

      {err && (
        <div className="rounded-2xl border border-red-300 bg-[var(--card)] p-6 text-sm text-red-600">
          讀取 Shopify 失敗：{err}
        </div>
      )}

      {!err && totalArticles === 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無文章。於 Shopify Blog 發佈後會顯示於此。
        </div>
      )}

      {blogs.map((b) =>
        b.articles.edges.length === 0 ? null : (
          <div key={b.id} className="mb-6">
            <h2 className="text-sm font-medium text-[var(--gold)] mb-2">
              {b.title}
            </h2>
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
                    <th className="px-4 py-3 font-medium">標題</th>
                    <th className="px-4 py-3 font-medium">作者</th>
                    <th className="px-4 py-3 font-medium">發佈日期</th>
                  </tr>
                </thead>
                <tbody>
                  {[...b.articles.edges]
                    .sort((x, y) =>
                      (y.node.publishedAt || "").localeCompare(
                        x.node.publishedAt || ""
                      )
                    )
                    .map((a) => (
                    <tr
                      key={a.node.id}
                      className="border-t border-[var(--line)]"
                    >
                      <td className="px-4 py-3">{a.node.title}</td>
                      <td className="px-4 py-3 text-[var(--soft)]">
                        {a.node.author?.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--soft)] whitespace-nowrap">
                        {a.node.publishedAt
                          ? a.node.publishedAt.slice(0, 10)
                          : "未發佈"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
