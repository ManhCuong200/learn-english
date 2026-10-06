import { PrismaClient, ToeicPart, ExamType } from '@prisma/client';

const prisma = new PrismaClient();

// ETS Scaled score table standard approximation (0-100 questions)
function getListeningScore(correct: number): number {
  if (correct <= 6) return 5;
  if (correct >= 93) return 495;
  const score = Math.round(5 + ((correct - 6) / (93 - 6)) * (495 - 5));
  return Math.min(495, Math.max(5, Math.round(score / 5) * 5));
}

function getReadingScore(correct: number): number {
  if (correct <= 9) return 5;
  if (correct >= 97) return 495;
  const score = Math.round(5 + ((correct - 9) / (97 - 9)) * (495 - 5));
  return Math.min(495, Math.max(5, Math.round(score / 5) * 5));
}

async function main() {
  console.log('--- Seeding Full TOEIC ETS Database ---');

  // 1. Seed Score Conversion Table
  const countConversions = await prisma.toeicScoreConversion.count();
  if (countConversions === 0) {
    console.log('Seeding Score Conversion Table (0-100 questions)...');
    const records: {
      correctCount: number;
      listeningScore: number;
      readingScore: number;
    }[] = [];
    for (let i = 0; i <= 100; i++) {
      records.push({
        correctCount: i,
        listeningScore: getListeningScore(i),
        readingScore: getReadingScore(i),
      });
    }
    await prisma.toeicScoreConversion.createMany({
      data: records,
    });
    console.log('✅ Created 101 score conversion rows.');
  }

  // 2. Prepare Sample ETS 2024 Test 1 Exam
  const examSlug = 'ets-toeic-2024-test-1';
  const existingExam = await prisma.toeicExam.findUnique({
    where: { slug: examSlug },
  });

  if (existingExam) {
    console.log(
      `Re-seeding "${existingExam.title}" to update full Part 1 - 7 questions...`,
    );
    await prisma.toeicExam.delete({
      where: { id: existingExam.id },
    });
  }

  console.log(
    'Creating comprehensive ETS TOEIC 2024 - Test 1 with Part 1 to Part 7...',
  );

  const exam = await prisma.toeicExam.create({
    data: {
      title: 'ETS TOEIC 2024 - Test 1',
      slug: examSlug,
      description:
        'Bộ đề thi chuẩn cấu trúc ETS TOEIC 2024 bản quyền có đầy đủ tất cả các dạng từ Part 1 đến Part 7, âm thanh bản xứ, bài đọc thực tế, bản dịch tiếng Việt và giải thích ngữ pháp chi tiết.',
      series: 'ETS',
      year: 2024,
      testNumber: 1,
      type: ExamType.FULL_TEST,
      duration: 120,
      totalQuestions: 20, // Representative full set across Part 1 - Part 7
      audioFullUrl: 'https://res.cloudinary.com/demo/video/upload/sample.mp3',
      difficulty: 'INTERMEDIATE',
      isPublished: true,
    },
  });

  // ==========================================
  // PART 1: PHOTOGRAPHS (Questions 1 - 2)
  // ==========================================
  console.log('Seeding Part 1: Photographs...');
  await prisma.toeicQuestion.create({
    data: {
      examId: exam.id,
      part: ToeicPart.PART_1,
      questionNumber: 1,
      questionText:
        'Look at the picture labeled No. 1 in your test book and choose the best statement.',
      imageUrl:
        'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80',
      audioUrl: 'https://res.cloudinary.com/demo/video/upload/sample.mp3',
      options: {
        A: 'A woman is typing on a laptop computer.',
        B: 'A woman is hanging a picture on a wall.',
        C: 'A woman is closing an office window.',
        D: 'A woman is drinking from a coffee mug.',
      },
      correctAnswer: 'A',
      explanation:
        'Quan sát hình ảnh: Người phụ nữ đang ngồi bên bàn và hai tay đặt trên bàn phím máy tính xách tay (typing on a laptop computer). Các hành động B (treo tranh), C (đóng cửa sổ), D (uống cà phê) đều không đúng với thực tế trong ảnh.',
      transcript:
        '(A) A woman is typing on a laptop computer.\n(B) A woman is hanging a picture on a wall.\n(C) A woman is closing an office window.\n(D) A woman is drinking from a coffee mug.',
    },
  });

  await prisma.toeicQuestion.create({
    data: {
      examId: exam.id,
      part: ToeicPart.PART_1,
      questionNumber: 2,
      questionText:
        'Look at the picture labeled No. 2 in your test book and choose the best statement.',
      imageUrl:
        'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
      audioUrl: 'https://res.cloudinary.com/demo/video/upload/sample.mp3',
      options: {
        A: 'Some colleagues are having a discussion around a table.',
        B: 'Papers are being shredded in a machine.',
        C: 'A whiteboard is being erased by a presenter.',
        D: 'All chairs in the room are unoccupied.',
      },
      correctAnswer: 'A',
      explanation:
        'Hình ảnh cho thấy một nhóm đồng nghiệp đang ngồi thảo luận sôi nổi quanh một chiếc bàn làm việc (colleagues are having a discussion around a table) => Đáp án A.',
      transcript:
        '(A) Some colleagues are having a discussion around a table.\n(B) Papers are being shredded in a machine.\n(C) A whiteboard is being erased by a presenter.\n(D) All chairs in the room are unoccupied.',
    },
  });

  // ==========================================
  // PART 2: QUESTION - RESPONSE (Questions 7 - 9)
  // ==========================================
  console.log('Seeding Part 2: Question-Response...');
  await prisma.toeicQuestion.create({
    data: {
      examId: exam.id,
      part: ToeicPart.PART_2,
      questionNumber: 7,
      questionText: 'Select the best response to the question or statement.',
      audioUrl: 'https://res.cloudinary.com/demo/video/upload/sample.mp3',
      options: {
        A: 'At the downtown convention center.',
        B: 'Yes, it was held yesterday.',
        C: 'Mr. Tanaka will give the presentation.',
      },
      correctAnswer: 'A',
      explanation:
        'Câu hỏi Wh-question bắt đầu bằng "Where" (Where will the annual marketing conference take place?). Cần trả lời về một địa điểm. Lựa chọn A (At the downtown convention center) chỉ nơi chốn chính xác. Câu hỏi Where không trả lời Yes/No nên loại B.',
      transcript:
        'Question: Where will the annual marketing conference take place?\n(A) At the downtown convention center.\n(B) Yes, it was held yesterday.\n(C) Mr. Tanaka will give the presentation.',
    },
  });

  await prisma.toeicQuestion.create({
    data: {
      examId: exam.id,
      part: ToeicPart.PART_2,
      questionNumber: 8,
      questionText: 'Select the best response to the question or statement.',
      audioUrl: 'https://res.cloudinary.com/demo/video/upload/sample.mp3',
      options: {
        A: 'By the end of the day on Friday.',
        B: 'No, she forgot her badge.',
        C: 'In the supply closet down the hall.',
      },
      correctAnswer: 'A',
      explanation:
        'Câu hỏi: "When is the project proposal due?" (Hạn nộp bản đề xuất dự án là khi nào?). Câu hỏi bắt đầu bằng "When" hỏi về thời gian. Đáp án A "By the end of the day on Friday" (Trước cuối ngày thứ Sáu) là câu trả lời chỉ thời gian thích hợp nhất.',
      transcript:
        'Question: When is the project proposal due?\n(A) By the end of the day on Friday.\n(B) No, she forgot her badge.\n(C) In the supply closet down the hall.',
    },
  });

  await prisma.toeicQuestion.create({
    data: {
      examId: exam.id,
      part: ToeicPart.PART_2,
      questionNumber: 9,
      questionText: 'Select the best response to the question or statement.',
      audioUrl: 'https://res.cloudinary.com/demo/video/upload/sample.mp3',
      options: {
        A: 'I really enjoyed that movie.',
        B: 'Sure, I would be happy to show you around.',
        C: 'It took about three hours.',
      },
      correctAnswer: 'B',
      explanation:
        'Câu hỏi: "Could you help me find the personnel office?" (Bạn có thể giúp tôi tìm phòng nhân sự được không?). Đây là lời yêu cầu lịch sự (Could you...). Đáp án B thể hiện sự sẵn lòng giúp đỡ: "Sure, I would be happy to show you around" (Chắc chắn rồi, tôi rất vui được dẫn bạn đi).',
      transcript:
        'Question: Could you help me find the personnel office?\n(A) I really enjoyed that movie.\n(B) Sure, I would be happy to show you around.\n(C) It took about three hours.',
    },
  });

  // ==========================================
  // PART 3: SHORT CONVERSATIONS (Questions 32 - 34)
  // ==========================================
  console.log('Seeding Part 3: Short Conversations...');
  const part3Passage = await prisma.toeicPassage.create({
    data: {
      examId: exam.id,
      part: ToeicPart.PART_3,
      passageNumber: 1,
      title: 'Questions 32-34 refer to the following conversation.',
      audioUrl: 'https://res.cloudinary.com/demo/video/upload/sample.mp3',
      transcript: `(Man): Hello, Ms. Gomez. I'm calling from Summit Logistics. We received your purchase order for twenty executive office desks, but unfortunately our delivery truck broke down earlier this morning.
(Woman): Oh no. That is quite problematic because our new branch opens next Monday, and the staff cannot work without desks. Can you deliver them by Friday at the latest?
(Man): Yes, absolutely. We have already dispatched a replacement vehicle from our regional depot. They will arrive at your building tomorrow before 2:00 P.M.`,
      translation: `(Nam): Xin chào cô Gomez. Tôi gọi từ công ty Summit Logistics. Chúng tôi đã nhận được đơn đặt hàng 20 chiếc bàn làm việc cao cấp của cô, nhưng không may là xe tải chở hàng của chúng tôi đã bị hỏng sáng sớm nay.
(Nữ): Ôi không. Điều đó khá phiền toái vì chi nhánh mới của chúng tôi khai trương vào thứ Hai tới, và nhân viên không thể làm việc nếu thiếu bàn. Anh có thể giao chúng muộn nhất vào thứ Sáu được không?
(Nam): Vâng, chắc chắn rồi. Chúng tôi đã điều động một xe thay thế từ kho trung chuyển khu vực. Xe sẽ tới tòa nhà của cô vào ngày mai trước 2 giờ chiều.`,
    },
  });

  await prisma.toeicQuestion.createMany({
    data: [
      {
        examId: exam.id,
        passageId: part3Passage.id,
        part: ToeicPart.PART_3,
        questionNumber: 32,
        questionText: 'Where does the man most likely work?',
        options: {
          A: 'At a furniture manufacturing factory',
          B: 'At a shipping and logistics company',
          C: 'At an interior design consultancy',
          D: 'At an automotive repair shop',
        },
        correctAnswer: 'B',
        explanation:
          'Người nam giới thiệu: "I\'m calling from Summit Logistics. We received your purchase order... our delivery truck broke down" => Anh ấy làm việc tại một công ty vận tải và hậu cần (shipping and logistics company).',
      },
      {
        examId: exam.id,
        passageId: part3Passage.id,
        part: ToeicPart.PART_3,
        questionNumber: 33,
        questionText: 'What problem does the man report?',
        options: {
          A: 'An item is currently out of stock',
          B: 'A delivery truck broke down',
          C: 'A payment failed to process',
          D: 'An incorrect address was provided',
        },
        correctAnswer: 'B',
        explanation:
          'Người nam thông báo rõ ràng: "our delivery truck broke down earlier this morning" (xe tải giao hàng bị hỏng sáng nay) => Chọn B.',
      },
      {
        examId: exam.id,
        passageId: part3Passage.id,
        part: ToeicPart.PART_3,
        questionNumber: 34,
        questionText: 'When will the furniture most likely arrive?',
        options: {
          A: 'Later this evening',
          B: 'Tomorrow afternoon',
          C: 'On Friday morning',
          D: 'Next Monday',
        },
        correctAnswer: 'B',
        explanation:
          'Người nam khẳng định: "They will arrive at your building tomorrow before 2:00 P.M." (Họ sẽ tới trước 2h chiều ngày mai => Tomorrow afternoon) => Chọn B.',
      },
    ],
  });

  // ==========================================
  // PART 4: SHORT TALKS (Questions 71 - 73)
  // ==========================================
  console.log('Seeding Part 4: Short Talks...');
  const part4Passage = await prisma.toeicPassage.create({
    data: {
      examId: exam.id,
      part: ToeicPart.PART_4,
      passageNumber: 2,
      title: 'Questions 71-73 refer to the following airport announcement.',
      audioUrl: 'https://res.cloudinary.com/demo/video/upload/sample.mp3',
      transcript: `Attention all passengers traveling on Skyward Airlines Flight 408 with nonstop service to Vancouver. Due to dense fog and severe weather conditions currently affecting our destination airport, our departure has been temporarily delayed by approximately forty-five minutes. Please remain seated in the gate area near Gate 22. Airline representatives are now distributing complimentary beverage vouchers at the main service counter. Thank you for your patience and understanding.`,
      translation: `Xin quý hành khách đi chuyến bay 408 của Hãng hàng không Skyward Airlines bay thẳng đến Vancouver chú ý. Do sương mù dày đặc và điều kiện thời tiết xấu hiện đang ảnh hưởng đến sân bay nơi đến, giờ khởi hành của chúng ta tạm thời bị hoãn khoảng 45 phút. Xin quý khách vui lòng ngồi tại khu vực cổng lên máy bay gần Cổng 22. Đại diện của hãng hàng không hiện đang phát phiếu đồ uống miễn phí tại quầy dịch vụ chính. Cảm ơn sự kiên nhẫn và thông cảm của quý vị.`,
    },
  });

  await prisma.toeicQuestion.createMany({
    data: [
      {
        examId: exam.id,
        passageId: part4Passage.id,
        part: ToeicPart.PART_4,
        questionNumber: 71,
        questionText: 'What is the main purpose of the announcement?',
        options: {
          A: 'To announce a flight delay',
          B: 'To call passengers for immediate boarding',
          C: 'To inform travelers of a gate change',
          D: 'To report lost baggage claims',
        },
        correctAnswer: 'A',
        explanation:
          'Mục đích của bài phát thanh là thông báo chuyến bay bị hoãn: "our departure has been temporarily delayed by approximately forty-five minutes" => Chọn A.',
      },
      {
        examId: exam.id,
        passageId: part4Passage.id,
        part: ToeicPart.PART_4,
        questionNumber: 72,
        questionText: 'What is mentioned as the cause of the delay?',
        options: {
          A: 'Mechanical difficulties on the plane',
          B: 'Severe weather conditions',
          C: 'A shortage of flight attendants',
          D: 'Air traffic control system errors',
        },
        correctAnswer: 'B',
        explanation:
          'Người phát thanh nêu rõ nguyên nhân: "Due to dense fog and severe weather conditions currently affecting our destination airport" (do sương mù và thời tiết xấu) => Chọn B.',
      },
      {
        examId: exam.id,
        passageId: part4Passage.id,
        part: ToeicPart.PART_4,
        questionNumber: 73,
        questionText: 'What are passengers offered at the service counter?',
        options: {
          A: 'Discount coupons for future tickets',
          B: 'Complimentary drink vouchers',
          C: 'Complimentary hotel accommodations',
          D: 'Luggage protection tags',
        },
        correctAnswer: 'B',
        explanation:
          'Đoạn băng nêu rõ: "distributing complimentary beverage vouchers at the main service counter" (phát phiếu đồ uống miễn phí) => Chọn B.',
      },
    ],
  });

  // ==========================================
  // PART 5: INCOMPLETE SENTENCES (Questions 101 - 104)
  // ==========================================
  console.log('Seeding Part 5: Incomplete Sentences...');
  await prisma.toeicQuestion.createMany({
    data: [
      {
        examId: exam.id,
        part: ToeicPart.PART_5,
        questionNumber: 101,
        questionText:
          'All regional department supervisors must submit their quarterly budget proposals _______ 5:00 P.M. on Friday.',
        options: {
          A: 'by',
          B: 'until',
          C: 'during',
          D: 'among',
        },
        correctAnswer: 'A',
        explanation:
          'Giới từ "by + mốc thời gian" diễn tả hành động phải hoàn thành trước hoặc muộn nhất vào thời điểm đó (hạn chót). Trong khi đó, "until" chỉ hành động kéo dài liên tục tới thời điểm đó. Đề xuất ngân sách là hành động nộp dứt điểm => Chọn A (by).',
      },
      {
        examId: exam.id,
        part: ToeicPart.PART_5,
        questionNumber: 102,
        questionText:
          'Mr. Thornton conducted the client satisfaction survey _______ and presented the insightful findings to the board.',
        options: {
          A: 'thorough',
          B: 'thoroughly',
          C: 'thoroughness',
          D: 'more thorough',
        },
        correctAnswer: 'B',
        explanation:
          'Vị trí cần điền đứng sau cụm tân ngữ "the client satisfaction survey" và bổ nghĩa cho động từ "conducted" (tiến hành). Cần một trạng từ (adverb) để bổ nghĩa cho động từ => Chọn "thoroughly" (B).',
      },
      {
        examId: exam.id,
        part: ToeicPart.PART_5,
        questionNumber: 103,
        questionText:
          'Even though the conference tickets were _______ expensive than expected, over three hundred attendees registered.',
        options: {
          A: 'much',
          B: 'very',
          C: 'more',
          D: 'such',
        },
        correctAnswer: 'C',
        explanation:
          'Cấu trúc so sánh hơn đối với tính từ dài "expensive" đi kèm từ so sánh "than" phía sau: "more + adj + than". Do đó vị trí trống cần từ "more" => Chọn C.',
      },
      {
        examId: exam.id,
        part: ToeicPart.PART_5,
        questionNumber: 104,
        questionText:
          'Dr. Rebecca Evans is widely considered one of the most _______ environmental scientists in Southeast Asia.',
        options: {
          A: 'influence',
          B: 'influential',
          C: 'influencing',
          D: 'influentially',
        },
        correctAnswer: 'B',
        explanation:
          'Cấu trúc so sánh nhất: "the most + adjective + noun". Ở đây bổ nghĩa cho danh từ "scientists" cần một tính từ chỉ tính chất => Chọn "influential" (có tầm ảnh hưởng lớn) - đáp án B.',
      },
    ],
  });

  // ==========================================
  // PART 6: TEXT COMPLETION (Questions 131 - 134)
  // ==========================================
  console.log('Seeding Part 6: Text Completion...');
  const part6Passage = await prisma.toeicPassage.create({
    data: {
      examId: exam.id,
      part: ToeicPart.PART_6,
      passageNumber: 3,
      title: 'Questions 131-134 refer to the following internal notice.',
      content: `TO: All Headquarters Personnel
FROM: Human Resources & Facilities
DATE: October 15, 2026
SUBJECT: Facility Upgrades and Energy Conservation

Starting next Monday, our main headquarters building will undergo scheduled electrical upgrades to optimize energy usage. As part of this initiative, high-efficiency LED fixtures will be installed across all office floors. This upgrade will significantly _______ [131] our overall electricity consumption.

During the renovation period, please anticipate brief interruptions in lighting between 6:00 P.M. and 9:00 P.M. on weekdays. Therefore, we encourage all employees to finish their responsibilities promptly and depart on time. _______ [132].

Additionally, new automated thermostats _______ [133] in conference rooms next month. These smart devices adjust climate controls depending on room occupancy. We are confident that these changes will create a more sustainable working environment.

We truly appreciate your _______ [134] and cooperation while these essential improvements are being carried out.`,
      translation: `GỬI: Toàn thể nhân viên trụ sở chính
TỪ: Bộ phận Nhân sự & Cơ sở vật chất
NGÀY: 15 tháng 10 năm 2026
CHỦ ĐỀ: Nâng cấp cơ sở vật chất và bảo tồn năng lượng

Bắt đầu từ thứ Hai tới, tòa nhà trụ sở chính của chúng ta sẽ tiến hành nâng cấp hệ thống điện theo kế hoạch nhằm tối ưu hóa việc sử dụng năng lượng. Như một phần của sáng kiến này, các thiết bị đèn LED hiệu suất cao sẽ được lắp đặt trên tất cả các tầng văn phòng. Việc nâng cấp này sẽ giúp [131] giảm đáng kể mức tiêu thụ điện năng tổng thể của chúng ta.

Trong thời gian cải tạo, vui lòng lường trước các gián đoạn ánh sáng ngắn từ 6:00 tối đến 9:00 tối các ngày trong tuần. Do đó, chúng tôi khuyến khích toàn thể nhân viên hoàn thành công việc nhanh chóng và rời văn phòng đúng giờ. [132] Làm thêm giờ vào buổi tối sẽ bị hạn chế nghiêm ngặt trong tuần này.

Ngoài ra, bộ điều nhiệt tự động mới [133] sẽ được lắp đặt tại các phòng hội nghị vào tháng tới. Những thiết bị thông minh này điều chỉnh nhiệt độ dựa theo số lượng người có mặt trong phòng. Chúng tôi tin tưởng rằng các thay đổi này sẽ tạo nên một môi trường làm việc bền vững hơn.

Chúng tôi chân thành cảm ơn [134] sự kiên nhẫn và hợp tác của các bạn trong khi các cải tiến cần thiết này được triển khai.`,
    },
  });

  await prisma.toeicQuestion.createMany({
    data: [
      {
        examId: exam.id,
        passageId: part6Passage.id,
        part: ToeicPart.PART_6,
        questionNumber: 131,
        questionText: 'Select the best word to complete blank [131].',
        options: {
          A: 'reduce',
          B: 'reduction',
          C: 'reducing',
          D: 'reduced',
        },
        correctAnswer: 'A',
        explanation:
          'Sau động từ khuyết thiếu "will" và trạng từ "significantly", cần một động từ nguyên thể không "to" (V-bare) => Chọn "reduce" (A).',
      },
      {
        examId: exam.id,
        passageId: part6Passage.id,
        part: ToeicPart.PART_6,
        questionNumber: 132,
        questionText: 'Select the best sentence to complete blank [132].',
        options: {
          A: 'Evening overtime work will be strictly restricted during this period.',
          B: 'The cafeteria will introduce a brand new organic lunch menu.',
          C: 'Free parking permits are available upon request at reception.',
          D: 'Please print out all your electronic documents in advance.',
        },
        correctAnswer: 'A',
        explanation:
          'Câu trước đó nhắc nhở nhân viên hoàn thành công việc và về đúng giờ vì ánh sáng sẽ bị ngắt quãng từ 6h-9h tối. Do đó câu nối tiếp hợp lý nhất về ngữ cảnh là "Evening overtime work will be strictly restricted during this period" (Làm thêm giờ buổi tối sẽ bị hạn chế nghiêm ngặt) => Chọn A.',
      },
      {
        examId: exam.id,
        passageId: part6Passage.id,
        part: ToeicPart.PART_6,
        questionNumber: 133,
        questionText: 'Select the best verb form to complete blank [133].',
        options: {
          A: 'were installed',
          B: 'will be installed',
          C: 'installed',
          D: 'have installed',
        },
        correctAnswer: 'B',
        explanation:
          'Chủ ngữ "automated thermostats" là vật bị tác động (bị động) và câu có trạng từ chỉ tương lai "next month" => Cần thì tương lai đơn ở thể bị động: "will be installed" (B).',
      },
      {
        examId: exam.id,
        passageId: part6Passage.id,
        part: ToeicPart.PART_6,
        questionNumber: 134,
        questionText: 'Select the best noun to complete blank [134].',
        options: {
          A: 'patience',
          B: 'patient',
          C: 'patiently',
          D: 'impatience',
        },
        correctAnswer: 'A',
        explanation:
          'Sau tính từ sở hữu "your" và trước liên từ "and cooperation" cần một danh từ mang nghĩa tích cực phù hợp với ngữ cảnh cảm ơn sự kiên nhẫn của nhân viên => Chọn danh từ "patience" (A).',
      },
    ],
  });

  // ==========================================
  // PART 7: READING COMPREHENSION (Questions 147 - 150)
  // Single Passage: Memo + Article
  // ==========================================
  console.log('Seeding Part 7: Reading Comprehension...');
  const part7Passage = await prisma.toeicPassage.create({
    data: {
      examId: exam.id,
      part: ToeicPart.PART_7,
      passageNumber: 4,
      title:
        'Questions 147-150 refer to the following press release and email.',
      content: `PRESS RELEASE
FOR IMMEDIATE RELEASE
SEATTLE, WA - BrightWave Technologies, an emerging leader in enterprise cloud data security, announced today the official acquisition of DataForge Software for $45 million. The deal, which finalized yesterday afternoon, is expected to broaden BrightWave's existing suite of threat detection solutions.

According to BrightWave CEO Elena Rostova, the integration of DataForge's specialized machine learning algorithms will empower corporate clients to identify potential network vulnerabilities up to four times faster. "Data security threats evolve continuously," stated Ms. Rostova. "By uniting our engineering teams, we are delivering unmatched proactive defenses for modern global businesses."

Current subscribers of DataForge will experience no disruption to their ongoing contracts. Existing software platforms will be maintained while new combined enterprise tools are scheduled for public release in early 2027.`,
      translation: `THÔNG CÁO BÁO CHÍ
ĐƯỢC PHÁT HÀNH NGAY LẬP TỨC
SEATTLE, WA - BrightWave Technologies, công ty tiên phong mới nổi về bảo mật dữ liệu đám mây cho doanh nghiệp, hôm nay đã công bố việc mua lại chính thức DataForge Software với giá 45 triệu USD. Thỏa thuận hoàn tất vào chiều hôm qua dự kiến sẽ mở rộng bộ giải pháp phát hiện mối đe dọa hiện có của BrightWave.

Theo CEO của BrightWave - bà Elena Rostova, việc tích hợp các thuật toán học máy chuyên biệt của DataForge sẽ giúp các khách hàng doanh nghiệp phát hiện các lỗ hổng mạng tiềm ẩn nhanh hơn gấp 4 lần. "Mối đe dọa an ninh dữ liệu liên tục biến hóa," bà Rostova phát biểu. "Bằng cách kết hợp các đội ngũ kỹ sư của hai bên, chúng tôi mang tới khả năng phòng vệ chủ động vượt trội cho các doanh nghiệp toàn cầu hiện đại."

Các khách hàng hiện tại của DataForge sẽ không gặp phải bất kỳ gián đoạn nào đối với hợp đồng hiện tại của họ. Các nền tảng phần mềm hiện có sẽ tiếp tục được duy trì, trong khi các công cụ doanh nghiệp kết hợp mới dự kiến sẽ được phát hành ra công chúng vào đầu năm 2027.`,
    },
  });

  await prisma.toeicQuestion.createMany({
    data: [
      {
        examId: exam.id,
        passageId: part7Passage.id,
        part: ToeicPart.PART_7,
        questionNumber: 147,
        questionText: 'What is the main subject of the press release?',
        options: {
          A: 'The corporate acquisition of a software company',
          B: 'The opening of a new research laboratory in Seattle',
          C: 'The retirement of a technology executive',
          D: 'A report on annual corporate earnings',
        },
        correctAnswer: 'A',
        explanation:
          'Thông cáo báo chí công bố thương vụ mua lại: "official acquisition of DataForge Software for $45 million" => Đây là thương vụ mua lại một công ty phần mềm (corporate acquisition of a software company) => Chọn A.',
      },
      {
        examId: exam.id,
        passageId: part7Passage.id,
        part: ToeicPart.PART_7,
        questionNumber: 148,
        questionText:
          'According to Ms. Rostova, what benefit will the acquisition bring to clients?',
        options: {
          A: 'Substantially lower annual subscription prices',
          B: 'Significantly faster identification of security risks',
          C: 'Free technical hardware upgrades',
          D: 'Direct access to cloud server facilities',
        },
        correctAnswer: 'B',
        explanation:
          'Bài viết trích lời bà Rostova: "empower corporate clients to identify potential network vulnerabilities up to four times faster" (giúp khách hàng phát hiện lỗ hổng mạng nhanh hơn gấp 4 lần => faster identification of security risks) => Chọn B.',
      },
      {
        examId: exam.id,
        passageId: part7Passage.id,
        part: ToeicPart.PART_7,
        questionNumber: 149,
        questionText: 'What is indicated about current DataForge customers?',
        options: {
          A: 'Their existing contracts will remain unaffected',
          B: 'They must transition to BrightWave software immediately',
          C: 'They will be charged additional service fees',
          D: 'Their current accounts will expire next month',
        },
        correctAnswer: 'A',
        explanation:
          'Đoạn cuối thông cáo khẳng định: "Current subscribers of DataForge will experience no disruption to their ongoing contracts" (khách hàng sẽ không gặp gián đoạn hợp đồng hiện tại => contracts remain unaffected) => Chọn A.',
      },
      {
        examId: exam.id,
        passageId: part7Passage.id,
        part: ToeicPart.PART_7,
        questionNumber: 150,
        questionText:
          'When are the new joint enterprise tools expected to launch?',
        options: {
          A: 'Immediately this week',
          B: 'In late 2026',
          C: 'In early 2027',
          D: 'In the summer of 2028',
        },
        correctAnswer: 'C',
        explanation:
          'Câu cuối cùng: "while new combined enterprise tools are scheduled for public release in early 2027" => Chọn C (In early 2027).',
      },
    ],
  });

  console.log(
    `✅ Seeded complete ETS TOEIC 2024 Exam: "${exam.title}" (ID: ${exam.id})`,
  );
  console.log('--- Finished Seeding Full TOEIC Data Successfully! ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
