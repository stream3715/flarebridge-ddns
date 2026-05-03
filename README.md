# FlareBridge DDNS

BASIC認証またはクエリパラメータ認証にしか対応していないルータから、Cloudflare の DNS A/AAAA レコードを動的に更新する Cloudflare Workers アプリケーションです。

## 概要

```
ルータ / クライアント
      │
      │ GET /update?hostname=home.example.com[&ip=x.x.x.x][&key=<api-key>]
      │ （または Authorization: Basic ヘッダ付き）
      ▼
Cloudflare Workers (FlareBridge DDNS)
      │
      ├── 1. リクエストの認証（Basic 認証 または ?key=）
      ├── 2. IP アドレスの検出（クエリパラメータ > CF-Connecting-IP > X-Forwarded-For）
      ├── 3. レコード種別の判定（IPv4 → A レコード、IPv6 → AAAA レコード）
      └── 4. Cloudflare DNS API でレコードを upsert
              │
              ▼
       Cloudflare DNS API
```

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. ローカル開発用シークレットの設定

```bash
cp .dev.vars.example .dev.vars
# .dev.vars を開いて実際の値を入力する
```

### 3. 本番環境へのシークレット登録

```bash
wrangler secret put API_KEY        # ルータに渡す認証キー
wrangler secret put CF_API_TOKEN   # Zone:DNS:Edit 権限を持つ Cloudflare API トークン
wrangler secret put CF_ZONE_ID     # 更新対象のゾーン ID
```

### 4. デプロイ

```bash
npm run deploy
```

## API

### エンドポイント

```
GET /update
```

### クエリパラメータ

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| `hostname` | Yes | 更新する FQDN（例: `home.example.com`） |
| `ip` | No | 設定する IP アドレス。省略すると送信元 IP を自動検出 |
| `key` | No* | 認証用 API キー（Basic 認証の代替） |

\* `key` または `Authorization: Basic` ヘッダのいずれかが必須。

### 認証方式

**BASIC 認証（推奨）**

```
Authorization: Basic base64(任意のユーザ名:APIキー)
```

ユーザ名は任意の値で構いません。パスワード部分が `API_KEY` シークレットと照合されます。

**クエリパラメータ認証**

```
GET /update?hostname=home.example.com&key=<APIキー>
```

> クエリパラメータに API キーを含めると Cloudflare のリクエストログに記録されます。本番環境では BASIC 認証を推奨します。

### リクエスト例

```bash
# BASIC 認証 + IP 自動検出
curl -u anyuser:mysecretkey \
  "https://flarebridge-ddns.<account>.workers.dev/update?hostname=home.example.com"

# クエリパラメータ認証 + IPv4 明示指定
curl "https://flarebridge-ddns.<account>.workers.dev/update?hostname=home.example.com&ip=203.0.113.42&key=mysecretkey"

# クエリパラメータ認証 + IPv6 明示指定
curl "https://flarebridge-ddns.<account>.workers.dev/update?hostname=home.example.com&ip=2001:db8::1&key=mysecretkey"
```

### レスポンス

**成功（200）**

```json
{
  "success": true,
  "message": "DNS record updated",
  "ip": "203.0.113.1",
  "type": "A"
}
```

**エラー**

| HTTP ステータス | `success` | 主な `message` |
|----------------|-----------|----------------|
| 400 | false | `"Missing hostname parameter"` |
| 400 | false | `"Invalid hostname parameter"` |
| 400 | false | `"Invalid or missing IP address"` |
| 401 | false | `"Unauthorized"` |
| 500 | false | `"Failed to update DNS record"` |

## 環境変数

シークレットは `.dev.vars` ファイルで管理します。`wrangler.jsonc` やソースコードには値を含めません。

| ファイル | 用途 | コミット |
|---------|------|---------|
| `.dev.vars` | ローカル開発用の実際の値 | しない（`.dev.vars.example` からコピー） |
| `.dev.vars.test` | テスト用の偽値 | する |
| `.dev.vars.example` | テンプレート | する |

## 開発

```bash
npm test           # テスト実行（vitest + Miniflare）
npm run dev        # ローカル開発サーバ起動（wrangler dev）
npm run deploy     # Cloudflare Workers へデプロイ
```

テストは Miniflare（Workers ランタイムエミュレータ）上で動作します。シークレットは `.dev.vars.test` から自動的に読み込まれます。
