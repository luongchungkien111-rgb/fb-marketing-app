// Script tao file CSV lich dang bai 30 ngay cho cac Fanpage salon toc.
// Chay: node content/generate-calendar.js
const fs = require('fs');
const path = require('path');
const { getHolidayForDate } = require('./vietnam-holidays');

const DB_FILE = path.join(__dirname, '..', 'data', 'app.db.json');
const OUT_FILE = path.join(__dirname, 'lich-30-ngay.csv');

// Cac Page duoc gan vao tung nhom noi dung (dua tren du lieu da xac nhan voi nguoi dung).
const MEN_PAGE_IDS = [8, 9, 12, 14]; // Nam Hair Cau Giay (x3), Le Quang Anh Nam Hair
const EXCLUDE_PAGE_IDS = [1]; // Ecopos Phan Mem Quan ly Salon Toc - khong phai salon

// CHI CO 1 DIA CHI THAT: 31 ngo 68 Trung Kinh, Cau Giay, Ha Noi.
// Ten Facebook goc cua nhieu Page co chua dia chi CU/KHAC (vd "32 Hoang Ngoc
// Phach Dong Da", "toa s106") - Facebook khong cho doi ten Page qua API, nen
// ten hien thi tren Facebook van giu nguyen, NHUNG noi dung bai dang phai
// dung "ten hien thi sach" nay (khong chua dia chi cu) de tranh nhac nham
// dia chi, gay hieu lam co nhieu chi nhanh.
const DISPLAY_NAME_OVERRIDES = {
  3: 'Susi Hair',
  4: 'Susi Hair Studio - Chuyên Duỗi Layer',
  5: 'Susi Hair Studio - Chuyên Duỗi Tóc',
  6: 'Susi Hair Salon',
  15: 'Hala Nguyen Hair Salon',
};

function displayNameFor(page) {
  return DISPLAY_NAME_OVERRIDES[page.id] || page.name.trim();
}

const START_DATE = '2026-08-09'; // ngay mai theo ngay hien tai
const NUM_DAYS = 30;
const POST_TIME = '19:30'; // gio Viet Nam

const WOMEN_TEMPLATES = [
  '🌸 Chào tháng mới cùng {salon}! Trọn tháng này, {salon} dành tặng các nàng công sở ưu đãi đặc biệt khi đặt lịch làm tóc. Nhắn tin ngay để giữ chỗ giờ đẹp nhé! 💇‍♀️\n#toccongso #uudaithangmoi',
  '💧 Mẹo nhỏ từ {salon}: gội đầu bằng nước ấm (không quá nóng), massage nhẹ da đầu 2-3 phút rồi xả bằng nước mát để tóc lên nếp và bóng mượt lâu hơn. Bạn đã thử chưa? 😉\n#meochamsoctoc #toccongso',
  '⏰ Ưu đãi giờ hành chính tại {salon}: đặt lịch cắt + gội trong khung 9h-17h các ngày trong tuần để được ưu đãi đặc biệt — tranh thủ giờ nghỉ trưa làm đẹp nhé!\n#uudaigiohanhchinh #tocdephangngay',
  '✂️ Không biết chọn kiểu tóc nào hợp khuôn mặt? Đến {salon}, đội ngũ stylist sẽ tư vấn miễn phí để bạn có mái tóc vừa hợp mặt vừa dễ chăm sóc mỗi sáng đi làm.\n#tuvantoccongso #kieutochopmat',
  '🕒 Bận rộn không có nhiều thời gian? Combo Cắt + Gội + Sấy tại {salon} giúp bạn có mái tóc gọn gàng chỉn chu chỉ trong một buổi, tiết kiệm thời gian tối đa cho hội chị em công sở.\n#combotrongoi #toccongso',
  '🎨 Mẹo chọn màu nhuộm từ {salon}: da vàng ấm hợp tông nâu hạt dẻ, nâu socola; da trắng hồng hợp tông khói, tro lạnh. Bạn thuộc tông da nào? Inbox để được tư vấn màu phù hợp nhé!\n#tuvanmaunhuom #nhuomtoc',
  '🌤️ Cuối tuần rảnh rỗi, ghé {salon} làm mới mái tóc cho tuần mới thật xinh! Đặt lịch trước để không phải chờ đợi nhé.\n#cuoituanlamtoc #toccongso',
  '💆‍♀️ Tóc uốn/duỗi dễ mất nếp nếu chăm sai cách. {salon} mách bạn: hạn chế cột tóc chặt, dùng lược răng thưa, ủ dưỡng 1 lần/tuần để nếp tóc bền đẹp lâu hơn.\n#chamsoctocuon #meotoc',
  '👩‍🎨 Đội ngũ stylist tại {salon} luôn cập nhật xu hướng mới, tận tâm tư vấn để mỗi khách hàng đều hài lòng khi rời salon. Đến trải nghiệm để cảm nhận sự khác biệt nhé!\n#stylistchuyennghiep #toccongso',
  '✨ Uốn lơi, nhuộm balayage đang là xu hướng được các nàng công sở yêu thích tại {salon} — vừa sang trọng vừa dễ phối đồ đi làm mỗi ngày.\n#trenduoc #uonlogia',
  '🎁 Giới thiệu bạn bè đến {salon} — cả bạn và người được giới thiệu đều nhận ưu đãi hấp dẫn khi làm tóc. Rủ ngay hội chị em công sở của bạn nhé!\n#gioithieubanbe #uudai',
  '🧴 Tóc khô xơ vì máy sấy, hoá chất? {salon} có liệu trình ủ phục hồi chuyên sâu chỉ 15-20 phút, giúp tóc mềm mượt trở lại nhanh chóng.\n#uphuchoi #toccongso',
  '⚡ Flash sale hôm nay tại {salon} — ưu đãi chỉ trong 1 ngày, nhanh tay đặt lịch trước khi hết chỗ nhé!\n#flashsale #uudaihomnay',
  '💬 "Lần đầu đến {salon} mà ưng ý ngay từ lần cắt đầu tiên, các bạn stylist tư vấn rất nhiệt tình" — đó là chia sẻ của một khách hàng thân thiết. Cảm ơn bạn đã tin tưởng!\n#khachhangnoigi #toccongso',
  '🧴 {salon} đang sử dụng dòng sản phẩm gội dưỡng chuyên sâu, an toàn cho tóc nhuộm/uốn, giúp tóc chắc khoẻ và lên màu chuẩn lâu hơn.\n#sanphamduongtoc #toccongso',
  '🩹 Tóc hư tổn nặng do nhuộm/duỗi nhiều lần? {salon} có liệu trình phục hồi chuyên sâu theo từng cấp độ hư tổn — tư vấn miễn phí trước khi làm.\n#phuchoitoc #toccongso',
  '⏱️ Mẹo tạo kiểu 5 phút mỗi sáng từ {salon}: sấy tóc theo chiều từ gốc xuống ngọn, dùng lược tròn tạo phồng nhẹ ở chân tóc — chuẩn bị đi làm nhanh gọn mà vẫn xinh.\n#taokieunhanh #meotoc',
  '📱 Đặt lịch trước qua Zalo/inbox {salon} để được giữ giờ đẹp và không phải chờ đợi khi đến salon — tiện lợi cho lịch trình bận rộn của bạn.\n#datlichtruoc #toccongso',
  '☕ {salon} không chỉ là nơi làm tóc mà còn là góc thư giãn lý tưởng cho giờ nghỉ trưa — ghé qua nhâm nhi trà, làm đẹp và nạp lại năng lượng cho buổi chiều làm việc.\n#khonggianthugian #toccongso',
  '❓ Hỏi đáp nhanh: Bao lâu nên đi cắt tóc 1 lần? {salon} khuyên bạn nên tỉa ngọn mỗi 6-8 tuần để tóc luôn gọn gàng và hạn chế chẻ ngọn.\n#hoidapchamtoc #toccongso',
  '🌀 Mẹo giữ nếp tóc uốn lâu hơn: hạn chế gội đầu liên tục, dùng gối lụa khi ngủ, và xịt dưỡng giữ nếp mỗi sáng — {salon} luôn sẵn sàng tư vấn thêm cho bạn.\n#giunepuon #meotoc',
  '🌆 Tối thứ 6 rảnh rỗi? Ghé {salon} làm mới mái tóc, chuẩn bị tinh thần thật xinh cho cuối tuần nhé!\n#toithu6 #toccongso',
  '🙋‍♀️ Lần đầu đến {salon}? Đừng ngại chia sẻ mong muốn của bạn — đội ngũ stylist sẽ tư vấn kỹ trước khi làm để đảm bảo bạn ưng ý nhất.\n#landaudentiem #toccongso',
  '📝 Trước mỗi dịch vụ, {salon} luôn dành thời gian tư vấn kỹ về kiểu dáng, màu sắc phù hợp với bạn — không làm vội, không qua loa.\n#tuvantacnhinh #toccongso',
  '🔥 Sấy, uốn, duỗi thường xuyên khiến tóc yếu dần. {salon} gợi ý dùng xịt dưỡng chống nhiệt trước khi tạo kiểu để bảo vệ tóc tốt hơn.\n#baovetoc #meotoc',
  '📅 Cuối tháng bận rộn, {salon} khuyên bạn nên đặt lịch sớm để giữ giờ đẹp — tránh tình trạng hết chỗ vào phút chót nhé.\n#datlichsom #toccongso',
  '💁‍♀️ Mặt tròn hợp tóc layer bồng nhẹ, mặt dài hợp mái thưa — {salon} luôn tư vấn kiểu tóc tôn dáng nhất cho từng khuôn mặt.\n#kieutochopmat #toccongso',
  '🙏 {salon} xin cảm ơn tất cả khách hàng đã tin tưởng và đồng hành trong suốt tháng qua. Hẹn gặp lại các bạn ở những lần làm tóc tiếp theo nhé!\n#camonkhachhang #toccongso',
  '🎉 Bật mí nhẹ: tháng sau {salon} sẽ có ưu đãi mới cực hấp dẫn dành riêng cho khách hàng thân thiết — đón chờ nhé!\n#uudaithangtoi #toccongso',
  '✅ Khép lại một tháng thật nhiều mái tóc đẹp tại {salon}! Cảm ơn các bạn đã ghé thăm — đặt lịch ngay hôm nay để bắt đầu tháng mới với diện mạo mới nhé.\n#tongketthang #toccongso',
];

const MEN_TEMPLATES = [
  '🌟 Chào tháng mới cùng {salon}! Tháng này, {salon} có ưu đãi đặc biệt dành cho anh em muốn làm mới diện mạo. Đặt lịch ngay để giữ chỗ nhé!\n#toccongso #uudaithangmoi',
  '💇‍♂️ Chưa biết chọn kiểu tóc nào phù hợp môi trường công sở? {salon} tư vấn miễn phí để anh vừa gọn gàng, chuyên nghiệp, vừa hợp phong cách riêng.\n#kieutocnamcongso #tuvantoc',
  '⏰ Giờ nghỉ trưa rảnh 30 phút? Ghé {salon} cắt gọn nhanh, đúng giờ, không phải chờ đợi lâu — quay lại làm việc vẫn kịp giờ.\n#uudaigiotrua #cattocnhanh',
  '💈 Combo Cắt + Gội + Tạo kiểu tại {salon} giúp anh có diện mạo chỉn chu trọn vẹn chỉ trong một lần ghé, tiết kiệm thời gian tối đa.\n#combotrongoi #toccongso',
  '🪒 Sau giờ làm căng thẳng, thử dịch vụ cạo mặt, vệ sinh da mặt thư giãn tại {salon} — vừa sạch sâu vừa giúp anh thư giãn tinh thần.\n#caomatthugian #toccongso',
  '💨 Mẹo giữ nếp tóc cả ngày từ {salon}: sấy khô hoàn toàn trước khi dùng gel/wax, chỉ dùng lượng vừa đủ để tóc không bết dính.\n#giunepcangay #meotocnam',
  '🎉 Cuối tuần rảnh rỗi, ghé {salon} làm mới đầu tóc, sẵn sàng tinh thần cho những kế hoạch cuối tuần nhé anh em!\n#cuoituanlamtoc #toccongso',
  '🔥 Uốn phồng nhẹ đang là kiểu được nhiều anh em công sở lựa chọn tại {salon} — tạo điểm nhấn phong cách mà vẫn lịch sự, gọn gàng.\n#uontocnam #trenduoc',
  '✂️ Đội ngũ barber tại {salon} tay nghề vững, tận tâm tư vấn để mỗi anh đều hài lòng với kiểu tóc mới. Ghé trải nghiệm nhé!\n#barberchuyennghiep #toccongso',
  '🎨 Nhuộm tóc nam không sợ "dừ" nếu chọn đúng tông. {salon} gợi ý các tông nâu tự nhiên, xám khói nhẹ nhàng, phù hợp môi trường công sở.\n#nhuomtocnam #tuvanmaunhuom',
  '🎁 Rủ bạn bè đến {salon} — cả anh và bạn đều nhận ưu đãi hấp dẫn khi làm tóc. Rủ ngay hội anh em cùng làm mới đầu tóc nào!\n#gioithieubanbe #uudai',
  '🧴 Da đầu dầu, gàu nhiều? {salon} có dịch vụ gội dưỡng chuyên sâu giúp da đầu sạch thoáng, tóc chắc khoẻ hơn từng ngày.\n#goiduongdadau #toccongso',
  '⚡ Flash sale hôm nay tại {salon} — ưu đãi chỉ trong 1 ngày, anh em nhanh tay đặt lịch nhé!\n#flashsale #uudaihomnay',
  '💬 "Cắt xong ưng ý ngay, không cần chỉnh sửa gì thêm" — chia sẻ từ một khách hàng thân thiết tại {salon}. Cảm ơn anh đã tin tưởng!\n#khachhangnoigi #toccongso',
  '🧴 {salon} đang sử dụng dòng sản phẩm chăm sóc tóc/da đầu chuyên dụng cho nam, an toàn và hiệu quả cho từng loại tóc.\n#sanphamchamsoctoc #toccongso',
  '🩹 Tóc hư tổn do nhuộm/tẩy nhiều lần? {salon} có liệu trình phục hồi phù hợp, giúp tóc chắc khoẻ trở lại.\n#phuchoitoc #toccongso',
  '⏱️ Mẹo tạo kiểu 3 phút mỗi sáng: sấy khô, dùng một lượng wax nhỏ vuốt nhẹ theo nếp tóc — {salon} luôn sẵn sàng hướng dẫn thêm cho anh.\n#taokieunhanh #meotocnam',
  '📱 Đặt lịch trước qua Zalo/inbox {salon} để giữ giờ đẹp, không phải chờ đợi khi ghé salon — tiện lợi cho lịch trình bận rộn.\n#datlichtruoc #toccongso',
  '☕ {salon} là điểm dừng chân lý tưởng sau giờ làm — không chỉ cắt tóc mà còn là không gian thư giãn đúng chất đàn ông.\n#khonggianthugian #toccongso',
  '❓ Hỏi đáp nhanh: Bao lâu nên cắt tóc lại 1 lần? {salon} khuyên anh nên cắt mỗi 3-4 tuần để tóc luôn gọn gàng, chuyên nghiệp.\n#hoidapchamtoc #toccongso',
  '🪖 Đội mũ bảo hiểm cả ngày dễ làm tóc bết, mất nếp. {salon} mách anh chọn kiểu tóc ngắn gọn, ít cần tạo kiểu để luôn chỉn chu.\n#kieutocgongang #meotocnam',
  '🌆 Tối thứ 6 rảnh rỗi? Ghé {salon} làm mới đầu tóc, sẵn sàng cho cuối tuần thật chất nhé anh em!\n#toithu6 #toccongso',
  '🙋‍♂️ Lần đầu đến {salon}? Cứ chia sẻ phong cách anh muốn, đội ngũ barber sẽ tư vấn kỹ trước khi cắt để anh ưng ý nhất.\n#landaudentiem #toccongso',
  '📝 Trước mỗi lần cắt, {salon} luôn dành thời gian trao đổi kỹ về kiểu tóc phù hợp với khuôn mặt và phong cách của anh.\n#tuvankieutoc #toccongso',
  '🔥 Dùng máy sấy, tạo kiểu thường xuyên dễ làm tóc khô xơ. {salon} gợi ý dùng thêm dưỡng tóc nhẹ để bảo vệ tóc tốt hơn.\n#baovetoc #meotocnam',
  '📅 Cuối tháng bận rộn, {salon} khuyên anh nên đặt lịch sớm để giữ giờ đẹp, tránh hết chỗ vào phút chót.\n#datlichsom #toccongso',
  '💇‍♂️ Kiểu tóc undercut, side part gọn gàng đang là lựa chọn hot của dân văn phòng tại {salon} — vừa trẻ trung vừa chuyên nghiệp.\n#kieutochot #toccongso',
  '🙏 {salon} xin cảm ơn tất cả các anh đã tin tưởng và ghé thăm trong suốt tháng qua. Hẹn gặp lại ở những lần cắt tóc tiếp theo!\n#camonkhachhang #toccongso',
  '🎉 Bật mí nhẹ: tháng sau {salon} sẽ có ưu đãi mới dành riêng cho khách hàng thân thiết — đón chờ nhé anh em!\n#uudaithangtoi #toccongso',
  '✅ Khép lại một tháng thật nhiều diện mạo mới tại {salon}! Cảm ơn anh em đã ghé thăm — đặt lịch ngay để bắt đầu tháng mới thật chỉn chu nhé.\n#tongketthang #toccongso',
];

// Cau ket luon xoay vong rieng theo tung Page (khong lien quan chu de ngay hom
// do) - de nhieu Page dung chung 1 bo template khong bi giong het nhau 100%
// khi dang cung ngay (tranh Facebook nghi ngo noi dung trung lap hang loat).
const EXTRA_CTA_WOMEN = [
  '📍 Đặt lịch ngay hôm nay để giữ chỗ giờ đẹp nhé!',
  '💌 Inbox {salon} để được tư vấn miễn phí!',
  '☎️ Gọi ngay hotline để đặt lịch nhanh nhất!',
  '📅 Đặt lịch trước để không phải chờ đợi khi ghé salon!',
  '💬 Nhắn tin ngay để được stylist tư vấn riêng cho bạn!',
];
const EXTRA_CTA_MEN = [
  '📍 Đặt lịch ngay hôm nay để giữ chỗ nhé anh em!',
  '💌 Inbox {salon} để được tư vấn nhanh!',
  '☎️ Gọi ngay hotline để đặt lịch trong hôm nay!',
  '📅 Đặt lịch trước để khỏi chờ khi ghé salon!',
  '💬 Nhắn tin ngay để được barber tư vấn kiểu tóc phù hợp!',
];

/**
 * Sinh caption rieng cho ngay le, thay the caption thuong cua ngay do.
 */
function holidayCaption(holiday, displayName, isMen) {
  const audience = isMen ? 'anh em' : 'các nàng';
  const emoji = holiday.name.includes('Tết') ? '🧧' : holiday.name.includes('Giáng sinh') ? '🎄' : '🎉';
  return `${emoji} ${holiday.name} đã đến gần! ${displayName} gợi ý ${audience}: ${holiday.salonAngle} — đặt lịch sớm để có giờ đẹp nhé, dịp này salon thường kín lịch nhanh!\n#${holiday.name.replace(/[^a-zA-Z0-9À-ỹ]/g, '').toLowerCase()} #toccongso`;
}

function escapeCsv(field) {
  const s = String(field ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function addDays(dateStr, n) {
  // Tinh toan thuan UTC, khong dua vao mui gio he thong (tranh lech ngay
  // neu may chay script khong o mui gio Viet Nam).
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Neu co file content/ai-templates-women.json / ai-templates-men.json (sinh boi
 * generate-ai-content.js) va du so ngay, uu tien dung noi dung AI moi thay vi
 * bo template co dinh - giup content thay doi moi thang khong bi lap lai.
 */
function loadTemplates(isMen) {
  const aiFile = path.join(__dirname, isMen ? 'ai-templates-men.json' : 'ai-templates-women.json');
  if (fs.existsSync(aiFile)) {
    try {
      const aiTemplates = JSON.parse(fs.readFileSync(aiFile, 'utf8'));
      if (Array.isArray(aiTemplates) && aiTemplates.length >= NUM_DAYS) {
        console.log(`Dung noi dung AI tu ${path.basename(aiFile)} cho nhom ${isMen ? 'nam' : 'nu'}.`);
        return aiTemplates;
      }
    } catch {
      // file loi/khong doc duoc - roi xuong dung template co dinh
    }
  }
  return isMen ? MEN_TEMPLATES : WOMEN_TEMPLATES;
}

function main() {
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const rows = [['page_row_id', 'date', 'time', 'content', 'image_url', 'video_url']];
  let womenPages = 0;
  let menPages = 0;
  let categoryIndex = { women: 0, men: 0 }; // dem rieng theo nhom de lech CTA giua cac Page cung nhom

  for (const page of db.pages) {
    if (EXCLUDE_PAGE_IDS.includes(page.id)) continue;
    const isMen = MEN_PAGE_IDS.includes(page.id);
    const templates = loadTemplates(isMen);
    const ctaPool = isMen ? EXTRA_CTA_MEN : EXTRA_CTA_WOMEN;
    const catKey = isMen ? 'men' : 'women';
    const pageOffset = categoryIndex[catKey]++;
    if (isMen) menPages++;
    else womenPages++;

    const displayName = displayNameFor(page);
    for (let day = 0; day < NUM_DAYS; day++) {
      const date = addDays(START_DATE, day);
      const holiday = getHolidayForDate(date);
      const cta = ctaPool[(day + pageOffset) % ctaPool.length].replace(/\{salon\}/g, displayName);

      let content;
      if (holiday) {
        content = holidayCaption(holiday, displayName, isMen) + '\n' + cta;
      } else {
        content = templates[day].replace(/\{salon\}/g, displayName) + '\n' + cta;
      }
      rows.push([page.id, date, POST_TIME, content, '', '']); // image_url, video_url de trong - ban tu dien neu co
    }
  }

  const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
  fs.writeFileSync(OUT_FILE, csv, 'utf8');
  console.log(`Da tao ${rows.length - 1} dong (${womenPages} page nu x 30 ngay + ${menPages} page nam x 30 ngay).`);
  console.log(`File: ${OUT_FILE}`);
}

main();
