# RiverClub: bàn poker online miễn phí cho nhóm bạn

## Mục tiêu sản phẩm
Một web app để nhóm bạn **chơi Texas Hold'em ngay trong vòng 60 giây**, không cần bài, bàn hay chip thật. Phù hợp khi đi team building hoặc khi bạn bè ở xa nhau.

- **Người dùng:** nhóm bạn và đồng nghiệp đã quen nhau, không phải người lạ trên bàn công khai.
- **Giá trị cốt lõi:** tiện lợi, vui vẻ, đơn giản hơn các sản phẩm cùng loại.
- **Giai đoạn hiện tại:** miễn phí hoàn toàn, chạy trên subdomain Vercel (`playriver.vercel.app`).
- **Tham khảo:** học luồng "tạo phòng, gửi link, chơi" của các app như PokerNow, nhưng tự thiết kế. Không sao chép mã nguồn, giao diện, logo, tên hay nội dung của họ.

## Nguyên tắc pháp lý (bắt buộc, không tự ý nới lỏng)
Chip chỉ để chơi vui và không có giá trị thực:

- Không bán chip, không có cổng thanh toán, không nhận crypto hay kết nối ví.
- Không đổi chip ra tiền, tài sản số, thẻ quà tặng hay hiện vật.
- Không chuyển chip giữa người chơi. Chip không tồn tại ngoài phòng chơi.
- Không có giải thưởng có giá trị, phí vào giải hay phần thưởng ngẫu nhiên trả tiền.
- Không làm tính năng ghi nhận "ai nợ ai" hoặc quy đổi kết quả ra tiền.
- Không đặt quảng cáo hay link tới trang cờ bạc.
- Hiển thị rõ: chỉ dành cho người từ 18 tuổi, chip không có giá trị thực, không dùng để cá cược tiền thật.

Nếu một yêu cầu đi ngược các nguyên tắc này, hãy dừng lại và nêu rõ để chủ dự án cân nhắc với luật sư.

**Chưa được xác nhận về pháp lý:** Nghị định 147/2024 của Việt Nam có thể ảnh hưởng tới game nhiều người chơi dùng hình ảnh lá bài, kể cả khi miễn phí. Không quảng bá công khai cho thị trường Việt Nam trước khi hỏi luật sư. Nếu vận hành công khai từ Đức, cần chuẩn bị Impressum và chính sách bảo mật theo GDPR.

## Phạm vi MVP

### Luồng chính
1. Trang chủ có đúng một hành động chính: **Tạo phòng**.
2. Chủ phòng chọn vài thiết lập rồi nhận link và mã phòng ngắn. Có nút sao chép và chia sẻ.
3. Bạn bè mở link, nhập tên, chọn ghế và chơi. **Không cần đăng ký, email hay mật khẩu.**
4. Tải lại trang hoặc mất mạng vẫn quay lại đúng ghế (token khách lưu trên thiết bị).

### Luật chơi
- No-Limit Texas Hold'em, 2 đến 9 người mỗi bàn.
- Luồng đầy đủ: blind, preflop, flop, turn, river, showdown.
- Đúng luật heads-up, min-raise, all-in, side pot, chia pot khi hòa và chip lẻ.
- Xáo bài bằng nguồn ngẫu nhiên an toàn trên máy chủ (Fisher-Yates với CSPRNG).

### Thiết lập phòng (có mặc định sẵn, không bắt buộc chỉnh)
- Chip khởi điểm: mặc định 1.000.
- Small blind / big blind: mặc định 10/20.
- Thời gian mỗi lượt: mặc định 15 giây.

### Chip
- **Chip theo từng phòng:** mọi người nhận mức khởi điểm như nhau và chip mất đi khi hết phòng.
- Hết chip là bị loại (không có nạp lại). Khi chỉ còn một người có chip thì trận kết thúc và hiện bảng xếp hạng; chủ phòng chọn **Chơi lại** (mọi người nhận lại chip khởi điểm) hoặc **Đóng bàn**. _(Chủ dự án quyết định ngày 2026-11-06, thay cho "xin nạp lại, chủ phòng duyệt".)_
- Không có ví cá nhân và không có thưởng đăng nhập hằng ngày trong MVP.

### Quyền chủ phòng
Bắt đầu và tạm dừng ván, chơi lại hoặc đóng bàn, đưa người chơi ra khỏi bàn hoặc đặt trạng thái vắng mặt, chuyển quyền chủ phòng.

### Giao diện
- **Ưu tiên điện thoại dọc**, thao tác bằng một tay. Các nút Fold, Check/Call, Raise luôn dễ bấm.
- Hiển thị rõ lượt của ai, đồng hồ, pot và chip mỗi người.
- Có chat văn bản ngắn và emoji trong phòng.
- Có phong cách riêng, không dùng tông casino lòe loẹt.
- Ngôn ngữ giao diện: tiếng Anh và tiếng Việt, gom chuỗi văn bản vào một chỗ.

### Chưa làm trong MVP
Tài khoản, bàn công khai, giải đấu nhiều bàn, voice/video, câu lạc bộ, bảng xếp hạng, thống kê, thanh toán, app di động. Voice có thể dùng Zalo, Discord hay Meet bên ngoài.

## Kỹ thuật đề xuất
- **Frontend và API:** Next.js (App Router) và TypeScript, deploy trên Vercel.
- **Dữ liệu và realtime:** Supabase (Postgres, Realtime). Vercel serverless không giữ được kết nối lâu dài, nên realtime phải đi qua dịch vụ riêng.
- **Poker engine:** thư viện TypeScript thuần trong `packages/engine` hoặc `lib/engine`, không phụ thuộc UI hay cơ sở dữ liệu. Dạng hàm thuần `(state, action) => state`.

### Yêu cầu bảo mật và đồng bộ
- **Máy chủ là nguồn sự thật duy nhất.** Mọi hành động đều được kiểm tra trên máy chủ, không tin client.
- **Không bao giờ gửi bài úp của người khác hay bộ bài còn lại tới client**, kể cả trong payload ẩn hoặc kênh realtime chung. Kiểm tra được bằng test.
- Xử lý hành động trong transaction có kiểm tra phiên bản, tránh hai thao tác cùng lúc làm sai trạng thái.
- Hành động có tính idempotent để gửi lại không bị tính hai lần.
- Hết giờ lượt: lưu thời điểm hết hạn trên máy chủ; mọi client đang mở phòng có thể yêu cầu xử lý, máy chủ tự kiểm tra rồi mới tự động check/fold.
- Giới hạn tần suất tạo phòng và gửi chat. Tự dọn phòng không hoạt động.

## Thứ tự thực hiện
1. **Engine và test:** viết trước, không làm UI. Test phải phủ side pot nhiều mức all-in, heads-up, so bài và chia pot hòa, min-raise, lượt đi, và bất biến "tổng chip không đổi".
2. **Backend phòng chơi:** tạo phòng, vào ghế, gửi hành động, gửi trạng thái riêng cho từng người chơi.
3. **Giao diện chơi** ưu tiên điện thoại.
4. **Kiểm thử nhiều người** bằng Playwright với nhiều phiên trình duyệt, gồm mất kết nối và hết giờ.
5. **Deploy** lên Vercel, kèm trang điều khoản ngắn và README hướng dẫn thiết lập.

## Tiêu chí hoàn thành MVP
- Từ trang chủ tới lúc chia ván đầu cho 3 người mất dưới 60 giây trên điện thoại.
- Một người tải lại trang giữa ván vẫn quay lại đúng ghế và đúng bài.
- Không tìm thấy bài úp của người khác trong dữ liệu mạng của client.
- Toàn bộ test engine đạt.

## Cách làm việc
- Ưu tiên giải pháp đơn giản nhất. Trước khi thêm tính năng, hỏi: nhóm bạn có cần điều này để bắt đầu chơi không?
- Không tự thêm tính năng ngoài MVP.
- Trước khi cần tài khoản, khóa dịch vụ hay mua gì, hãy dừng lại và hỏi chủ dự án. Không ghi khóa bí mật vào mã nguồn.
