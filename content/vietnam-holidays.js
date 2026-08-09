// Danh sach ngay le/dip quan trong o Viet Nam, kem goi y goc do marketing rieng
// cho salon toc. Cac ngay am lich (Tet, Trung Thu, Gio To...) la NGAY DUONG LICH
// UOC TINH cho nam 2026 - nen kiem tra lai lich am chinh xac gan ngay, vi le
// nay se lech tung nam.
//
// Dung trong content/generate-calendar.js: neu 1 ngay trong lich trung voi ngay
// le o day, se dung caption rieng cho ngay do thay vi caption thuong.

const HOLIDAYS_2026 = [
  { date: '2026-01-01', name: 'Tết Dương lịch', salonAngle: 'làm mới diện mạo chào năm mới' },
  { date: '2026-02-14', name: 'Valentine', salonAngle: 'làm tóc xinh đi hẹn hò Valentine' },
  { date: '2026-02-17', name: 'Tết Nguyên Đán (mùng 1)', salonAngle: 'làm đẹp đón Tết - dịp vàng của salon tóc, nên có content riêng suốt 1-2 tuần trước Tết' },
  { date: '2026-03-08', name: 'Quốc tế Phụ nữ 8/3', salonAngle: 'ưu đãi đặc biệt tri ân phái đẹp' },
  { date: '2026-04-26', name: 'Giỗ Tổ Hùng Vương (10/3 âm lịch, ước tính)', salonAngle: 'làm tóc đẹp đi du lịch/về quê dịp lễ' },
  { date: '2026-04-30', name: 'Ngày Giải phóng miền Nam 30/4', salonAngle: 'ưu đãi kỳ nghỉ lễ 30/4 - 1/5' },
  { date: '2026-05-01', name: 'Quốc tế Lao động 1/5', salonAngle: 'làm tóc đẹp cho kỳ nghỉ lễ dài ngày' },
  { date: '2026-06-01', name: 'Quốc tế Thiếu nhi 1/6', salonAngle: 'ưu đãi cắt tóc cho các bé (nếu salon có dịch vụ trẻ em)' },
  { date: '2026-09-02', name: 'Quốc khánh 2/9', salonAngle: 'ưu đãi kỳ nghỉ lễ Quốc khánh' },
  { date: '2026-09-25', name: 'Tết Trung Thu (15/8 âm lịch, ước tính)', salonAngle: 'không khí Trung Thu ấm áp, làm đẹp cùng gia đình' },
  { date: '2026-10-20', name: 'Phụ nữ Việt Nam 20/10', salonAngle: 'tri ân khách hàng nữ, ưu đãi đặc biệt' },
  { date: '2026-10-31', name: 'Halloween', salonAngle: 'tạo kiểu tóc/nhuộm màu độc đáo cho Halloween' },
  { date: '2026-12-24', name: 'Giáng sinh', salonAngle: 'làm tóc lộng lẫy đón Giáng sinh, tiệc cuối năm' },
];

/**
 * Tra cuu xem 1 ngay (YYYY-MM-DD) co trung ngay le nao khong. Tra ve object
 * ngay le hoac null.
 */
function getHolidayForDate(dateStr) {
  return HOLIDAYS_2026.find((h) => h.date === dateStr) || null;
}

module.exports = { HOLIDAYS_2026, getHolidayForDate };
