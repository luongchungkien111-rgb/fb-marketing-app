# Checklist ổn định Meta/Facebook

- Business Portfolio có tối thiểu 2 quản trị viên thật, đều bật 2FA.
- App `Fanpage Marketing Tool` có quản trị viên dự phòng.
- Hoàn tất Business Verification và Data Use Checkup khi Meta yêu cầu.
- Tất cả Page cần đăng thuộc/được chia sẻ chính thức cho Business Portfolio.
- Không dùng tài khoản giả hoặc chia sẻ mật khẩu giữa nhiều người.
- Sau checkpoint/đổi mật khẩu: kết nối Facebook lại trong app, chạy Health Check, rồi mới thử lại bài lỗi.
- Trước khi nâng Graph API: đặt `FACEBOOK_GRAPH_TEST_VERSION`, chạy `npm run facebook:preflight`; chỉ đổi `GRAPH_API_VERSION` khi failed = 0.
- Ưu tiên Webhook cho bình luận; polling chỉ là phương án dự phòng.
- Duy trì nội dung khác nhau giữa Page; app cảnh báo khi giống từ 85% trong 12 giờ.
