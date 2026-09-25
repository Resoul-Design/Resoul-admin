import { createClient } from "@/lib/supabase/server";
import { setPostStatus, deletePost } from "./actions";
import { LANDING_URL } from "@/lib/company";
import { CopyShareLink } from "./_copy-link";

type Post = {
  id: string;
  created_at: string;
  context: string;
  name: string | null;
  body: string;
  image_path: string | null;
  status: string;
  crisis_flag: boolean;
  pet_name: string | null;
  years: string | null;
  one_line: string | null;
  visibility: string | null;
  slug: string | null;
};

const VIS_LABEL: Record<string, string> = {
  public: "公開（審核後顯示）",
  link: "只限連結",
  private: "私人保存",
};

const STATUS_LABEL: Record<string, string> = {
  held: "待審",
  visible: "顯示中",
  hidden: "已隱藏",
};

const IMG_BASE =
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "") +
  "/storage/v1/object/public/board-images/";

export async function BoardView({
  title,
  subtitle,
  contextType,
  filter,
  basePath,
}: {
  title: string;
  subtitle: string;
  contextType: "blog" | "community";
  filter: string;
  basePath: string;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("posts")
    .select("*")
    .order("crisis_flag", { ascending: false })
    .order("created_at", { ascending: false });

  if (contextType === "community") query = query.in("context", ["board", "memorial"]);
  else query = query.like("context", "blog:%");

  if (filter !== "all") query = query.eq("status", filter);

  const { data, error } = await query.limit(200);
  const posts = (data ?? []) as Post[];

  const tabs = [
    { key: "held", label: "待審" },
    { key: "visible", label: "顯示中" },
    { key: "hidden", label: "已隱藏" },
    { key: "all", label: "全部" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">{title}</h1>
      <p className="text-sm text-[var(--soft)] mb-5">{subtitle}</p>

      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`${basePath}?filter=${t.key}`}
            className={
              "px-3 py-1.5 rounded-full text-sm border transition " +
              (filter === t.key
                ? "bg-[var(--gold)] text-white border-[var(--gold)]"
                : "bg-[var(--card)] text-[var(--soft)] border-[var(--line)] hover:bg-[var(--cream)]")
            }
          >
            {t.label}
          </a>
        ))}
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600">
          讀取失敗：{error.message}（請確認已執行 db/schema.sql 的員工審核權限）
        </div>
      )}

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          此分類暫無留言。
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <div
              key={p.id}
              className={
                "rounded-2xl border bg-[var(--card)] p-4 " +
                (p.crisis_flag ? "border-red-300" : "border-[var(--line)]")
              }
            >
              <div className="flex items-center gap-2 mb-3 text-xs text-[var(--soft)] flex-wrap">
                {contextType === "blog" && (
                  <span>{p.context.startsWith("blog:") ? p.context.slice(5) : p.context}</span>
                )}
                <span>
                  {contextType === "community" ? "提交時間：" : ""}
                  {p.created_at?.slice(0, 16).replace("T", " ")}
                </span>
                <span
                  className={
                    "ml-1 px-2 py-0.5 rounded-full " +
                    (p.status === "visible"
                      ? "bg-green-100 text-green-800"
                      : p.status === "hidden"
                      ? "bg-gray-200 text-gray-600"
                      : "bg-amber-100 text-amber-800")
                  }
                >
                  {STATUS_LABEL[p.status] || p.status}
                </span>
                {p.crisis_flag && (
                  <span
                    className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium"
                    title="系統審核提示，並不代表已確認危機。請閱讀留言內容後再判斷。"
                  >
                    ⚠ 優先查看
                  </span>
                )}
              </div>

              {contextType === "community" && (p.pet_name || p.years) && (
                <dl className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {p.pet_name && (
                    <div className="flex gap-2">
                      <dt className="text-[var(--soft)]">毛孩名字</dt>
                      <dd className="font-medium">{p.pet_name}</dd>
                    </div>
                  )}
                  {p.years && (
                    <div className="flex gap-2">
                      <dt className="text-[var(--soft)]">相伴年份／時間</dt>
                      <dd>{p.years}</dd>
                    </div>
                  )}
                </dl>
              )}
              {contextType === "blog" && p.years && (
                <div className="mb-2 text-sm text-[var(--soft)]">相伴年份／時間：{p.years}</div>
              )}
              {p.one_line && (
                <div className="mb-2 text-sm">
                  <div className="text-xs text-[var(--soft)]">最像牠的一句話</div>
                  <div className="italic">「{p.one_line}」</div>
                </div>
              )}

              <div className="text-sm mb-1">
                {contextType === "community" && (
                  <div className="text-xs text-[var(--soft)] mb-0.5">故事內容</div>
                )}
                <div className="whitespace-pre-wrap">{p.body}</div>
                {contextType === "community" ? (
                  <div className="mt-1 text-xs text-[var(--soft)]">署名：{p.name || "一位主人"}</div>
                ) : (
                  <div className="mt-1 text-xs text-[var(--soft)]">{p.name || "匿名"}</div>
                )}
              </div>

              {p.visibility && (
                <div className="text-xs text-[var(--soft)] mt-1">
                  {contextType === "community" ? "分享設定：" : "私隱："}
                  {VIS_LABEL[p.visibility] || p.visibility}
                </div>
              )}

              {p.visibility === "link" && p.slug && (
                <CopyShareLink url={`${LANDING_URL}/board?s=${p.slug}`} active={p.status === "visible"} />
              )}

              {p.image_path && (
                <a href={IMG_BASE + p.image_path} target="_blank" rel="noopener noreferrer" className="inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={IMG_BASE + p.image_path}
                    alt="留言相片"
                    className="mt-2 max-h-64 rounded-lg border border-[var(--line)] hover:opacity-90 transition"
                  />
                </a>
              )}

              <div className="flex gap-2 mt-3">
                {p.status !== "visible" && (
                  <form action={setPostStatus}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="status" value="visible" />
                    <button className="text-xs px-3 py-1.5 rounded-md bg-green-600 text-white hover:opacity-90">
                      {p.status === "hidden" ? "重新公開" : "核准並公開"}
                    </button>
                  </form>
                )}
                {p.status !== "hidden" && (
                  <form action={setPostStatus}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="status" value="hidden" />
                    <button className="text-xs px-3 py-1.5 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300">
                      暫不公開
                    </button>
                  </form>
                )}
                <form action={deletePost}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="text-xs px-3 py-1.5 rounded-md text-red-600 hover:bg-red-50">
                    刪除
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
