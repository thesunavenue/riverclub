import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "RiverClub · Terms" };

/** Short terms in both languages. Static page, no data collected beyond what the game needs. */
export default function Terms() {
  return (
    <main className="home" style={{ gap: 18 }}>
      <Link href="/" className="brand" style={{ color: "inherit", textDecoration: "none" }}>
        <span className="brand-mark" aria-hidden>
          ♠
        </span>
        RiverClub
      </Link>

      <section className="panel" lang="en">
        <h1 style={{ margin: 0, fontSize: 22 }}>Terms</h1>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          <li>RiverClub is a free poker table for friends who already know each other. 18+ only.</li>
          <li>Chips are play chips. They have no real value, cannot be bought, sold, transferred, or exchanged for money or anything else, and disappear when the room ends.</li>
          <li>Do not use RiverClub to bet real money, or to record who owes whom.</li>
          <li>No accounts. To keep your seat, your device stores a random guest token. The server keeps rooms (names you type, seats, chips, chat, the last 20 hands) and deletes inactive rooms.</li>
          <li>The service is provided as is, without guarantees, and may change or stop at any time.</li>
        </ul>
      </section>

      <section className="panel" lang="vi">
        <h2 style={{ margin: 0, fontSize: 20 }}>Điều khoản</h2>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          <li>RiverClub là bàn poker miễn phí cho nhóm bạn đã quen nhau. Chỉ dành cho người từ 18 tuổi.</li>
          <li>Chip chỉ để chơi vui, không có giá trị thực, không mua, bán, chuyển hay đổi ra tiền hoặc bất cứ thứ gì, và mất đi khi hết phòng.</li>
          <li>Không dùng RiverClub để cá cược tiền thật hay ghi nhận ai nợ ai.</li>
          <li>Không cần tài khoản. Để giữ ghế, thiết bị của bạn lưu một mã khách ngẫu nhiên. Máy chủ lưu phòng chơi (tên bạn nhập, ghế, chip, chat, 20 ván gần nhất) và xoá các phòng không hoạt động.</li>
          <li>Dịch vụ được cung cấp như hiện có, không có cam kết, và có thể thay đổi hoặc ngừng bất cứ lúc nào.</li>
        </ul>
      </section>

      <Link className="btn btn-primary" href="/">
        ← RiverClub
      </Link>
    </main>
  );
}
