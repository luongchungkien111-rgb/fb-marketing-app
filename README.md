# Phần mềm Marketing Đăng bài Facebook tự động

Web app tự host giúp bạn soạn bài, lên lịch và tự động đăng lên **Facebook Page** thông qua **Graph API chính thức** của Meta.

> ⚠️ **Group Facebook**: Meta đã gỡ quyền `publish_to_groups` cho hầu hết ứng dụng từ 2018, nên phần mềm này **không** đăng tự động vào Group được (không có cách hợp lệ nào làm việc này qua API cho app thường). Chỉ hỗ trợ đầy đủ cho Fanpage.

## 1. Cài đặt

```bash
cd fb-marketing-app
npm install
npm start
```

Mở trình duyệt tại `http://localhost:3000`.

## 2. Cách lấy Page — 2 lựa chọn

### Cách A — Đăng nhập bằng Facebook (khuyến nghị, lấy được nhiều Page cùng lúc)

1. Vào [Meta for Developers](https://developers.facebook.com/apps) → chọn App bạn đã tạo (hoặc tạo mới loại **Business**, use case **"Manage everything on your Page"**).
2. Trong Dashboard của App → bấm **"Add Product"** → thêm sản phẩm **"Facebook Login"** → **Set up**.
3. Vào **Facebook Login → Settings**, ở mục **"Valid OAuth Redirect URIs"**, thêm đúng:
   ```
   http://localhost:3000/auth/facebook/callback
   ```
   (đổi `3000` nếu bạn chạy cổng khác) → **Save changes**.
4. Vào **App settings → Basic**, copy **App ID** và bấm **Show** để copy **App Secret**.
5. Vào **Use cases → Customize** use case "Manage everything on your Page" → tab Permissions → bấm **Add** cho các quyền: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_read_user_content` (quyền cuối dùng để đọc số bình luận ở mục Insights).
6. Tạo file `.env` trong thư mục `fb-marketing-app` (copy từ `.env.example`), dán vào:
   ```
   FB_APP_ID=<App ID vừa copy>
   FB_APP_SECRET=<App Secret vừa copy>
   FB_REDIRECT_URI=http://localhost:3000/auth/facebook/callback
   ```
7. Chạy `npm start`, mở `http://localhost:3000`, bấm nút **"Đăng nhập bằng Facebook"**.
8. Đăng nhập + xác nhận cấp quyền cho từng Page bạn muốn phần mềm quản lý (Facebook cho chọn 1, nhiều, hoặc tất cả Page).
9. Xong — phần mềm tự động thêm tất cả Page đó vào danh sách, kèm token dùng lâu dài, không cần copy tay.

> Lưu ý bảo mật: **App Secret** là bí mật quan trọng — chỉ để trong file `.env` (đã có trong `.gitignore`), không chia sẻ hay commit lên Git, không dán vào chat với bất kỳ ai/công cụ nào ngoài file cấu hình của chính app.

### Cách B — Lấy thủ công 1 Page qua Graph API Explorer

Dùng khi chỉ cần 1 Page hoặc không muốn cấu hình OAuth ở trên.

1. Vào **Graph API Explorer** (developers.facebook.com/tools/explorer), chọn App của bạn.
2. Ở "User or Page" → chọn **"Get Page Access Token"**.
3. Bấm **"Add a Permission"** → tick `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` **trước khi** bấm Generate (nếu bấm Generate trước sẽ lỗi "Invalid Scopes").
4. Bấm **"Generate Access Token"** → chọn Page → xác nhận.
5. Copy token → vào https://developers.facebook.com/tools/debug/accesstoken/ → **Extend Access Token** để lấy bản dài hạn (~60 ngày).
6. Copy token dài hạn + **Page ID** (Cài đặt Page → Thông tin Page) → dán vào mục "Quản lý Fanpage" trong app.

## 3. Sử dụng cơ bản

- **Quản lý Fanpage**: thêm Page ID + Access Token, app sẽ xác thực với Facebook trước khi lưu.
- **Soạn bài**: tick chọn 1 hoặc nhiều Page, nhập nội dung, đính kèm ảnh (tuỳ chọn).
  - **Đăng ngay**: gửi lên Facebook lập tức (giãn cách vài giây giữa các Page để tránh bị Facebook giới hạn tốc độ).
  - **Lên lịch**: chọn ngày giờ, phần mềm lưu vào hàng đợi và **tự động gửi đúng giờ** (kiểm tra mỗi phút — server phải đang chạy vào thời điểm đó).
- **Sửa bài đang chờ lịch**: bấm "Sửa" ngay trong bảng để đổi nội dung/giờ, không cần huỷ rồi tạo lại.
- **Danh sách bài viết**: xem trạng thái Đang chờ / Đã đăng / Lỗi, link bài thật (🔗) khi đã đăng, số like/comment/share nếu đã cập nhật insights.

## 4. Nhập/xuất lịch hàng loạt (CSV)

**Nhập** — cột: `page_row_id,date,time,content,image_url,video_url,image_path`
- `date`: YYYY-MM-DD, `time`: HH:MM (giờ Việt Nam).
- `image_url`/`video_url`: link công khai trên internet (Facebook tự tải).
- `image_path`: đường dẫn file ảnh **có sẵn trên máy đang chạy phần mềm** (ảnh sẽ tự được nén nếu quá 1MB trước khi đăng).
- Luôn bấm **"Xem trước"** trước, kiểm tra không có dòng lỗi rồi mới **"Xác nhận"**.

**Xuất trạng thái** — bấm nút "⬇️ Xuất file trạng thái" bất cứ lúc nào để tải CSV mới nhất, có thêm cột `status`, `post_link`, `likes`, `comments`, `shares`.

Xem thư mục `content/` — có sẵn script mẫu:
- `generate-calendar.js`: sinh lịch 30 ngày từ template có sẵn (chỉnh sửa template trong file để đổi nội dung).
- `assign-images.js`: gán ảnh từ 1 thư mục local xoay vòng vào file CSV (đọc đường dẫn từ `content/photo-folder.txt`).

## 5. Theo dõi hiệu quả (Insights)

Bấm **"🔄 Cập nhật lượt tương tác"** để lấy số like/comment/share của các bài đã đăng qua Graph API.

> ⚠️ Facebook giới hạn: đọc **số lượt thích** cần quyền `pages_read_engagement`, đọc **bình luận** cần `pages_read_user_content` — cả hai đôi khi cần **Advanced Access** (App Review chính thức từ Meta) mới hoạt động đầy đủ ngay cả khi bạn là Admin của Page. Nếu insights trả về trống, đó là giới hạn từ Meta chứ không phải lỗi phần mềm — số **shares** thường vẫn lấy được bình thường.

## 6. Đăng lỗi & thử lại tự động

- Khi đăng thất bại, phần mềm **tự thử lại tối đa 3 lần** (cách nhau 5 phút → 15 phút → 45 phút) trước khi đánh dấu "Lỗi" hẳn.
- Thất bại vĩnh viễn sẽ: hiện banner cảnh báo đỏ trên giao diện, ghi vào `data/canh-bao.log`, và gửi webhook nếu bạn cấu hình `WEBHOOK_URL` trong `.env` (Zalo OA, Slack, Discord... đều nhận được JSON POST).

## 7. Backup dữ liệu

Tự động sao lưu `data/app.db.json` mỗi ngày lúc 3h sáng (và ngay lúc khởi động server) vào `data/backups/`, giữ 14 bản gần nhất. Muốn khôi phục: copy 1 file backup đè lên `data/app.db.json` rồi khởi động lại server.

## 8. Bảo mật

- **Mã hoá token**: đặt `ENCRYPTION_KEY` bất kỳ trong `.env` để Access Token được mã hoá AES-256 khi lưu trên đĩa (thay vì lưu thô). Đổi khoá sau khi đã có dữ liệu sẽ khiến token cũ không đọc được nữa — cần đăng nhập lại Facebook để tạo token mới.
- **Đăng nhập bảo vệ app**: đặt `APP_PASSWORD` trong `.env` để bật màn hình đăng nhập cho toàn bộ web app — nếu để trống, bất kỳ ai truy cập được `localhost:3000` (hoặc IP máy bạn nếu mở mạng) đều xem/sửa được hết dữ liệu và token.
- File `data/app.db.json` — dù đã hỗ trợ mã hoá — vẫn **không nên commit lên Git công khai hay chia sẻ máy chủ** (đã có trong `.gitignore`).

## 9. Chạy 24/7 bằng PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save                  # luu danh sach app de tu khoi dong lai
pm2 startup               # (chay 1 lan, lam theo huong dan hien ra) de PM2 tu chay khi may khoi dong lai
```

Lệnh hữu ích:
```bash
pm2 status                # xem trang thai
pm2 logs fb-marketing-app # xem log truc tiep
pm2 restart fb-marketing-app
pm2 stop fb-marketing-app
```

PM2 tự khởi động lại app nếu bị crash. Nếu chạy trên máy cá nhân (không phải VPS), máy vẫn phải **bật và không sleep** vào các khung giờ đã lên lịch đăng bài.
