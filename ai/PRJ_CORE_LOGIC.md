# KPI Calculation Logic & Workflow

## 1. Workflow
- Hệ thống KHÔNG cần quy trình phê duyệt (No Approval Workflow).
- Cán bộ nhập liệu -> Hệ thống lưu và tự động tính điểm ngay lập tức.
- Kết quả hiển thị realtime trên Dashboard cá nhân và Dashboard tổng hợp của lãnh đạo.

## 2. Scoring Calculation (Tham chiếu Source Code)
- Việc tính điểm phải tuân thủ logic từ source code của project `kpi-dun.web.app`, lưu trong thư mục `\New folder (2)\kpi` ở máy tôi.

- Admin có quyền cấu hình:
    - Danh mục loại công việc (Job Types).
    - Trọng số (Weights) cho từng loại.
    - Công thức phạt (Penalty Rules) khi quá hạn.

## 3. Data Integrity
- Chốt dữ liệu theo tháng/quý. Sau khi hết hạn nhập, hệ thống tự động khóa bản ghi để đảm bảo tính minh bạch (Admin có thể mở khóa).