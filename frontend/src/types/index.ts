export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone_number?: string;
  is_email_verified: boolean;
  created_at: string;
}

export interface HotelSettings {
  check_in_time: string;
  check_out_time: string;
  max_advance_booking_days: number;
  cancellation_hours: number;
  allow_same_day_booking: boolean;
  tax_rate_percent: string;
  breakfast_included_default: boolean;
  terms_and_conditions: string;
}

export interface Hotel {
  id: number;
  name: string;
  slug: string;
  phone: string;
  email: string;
  website: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state_province: string;
  postal_code: string;
  country: string;
  timezone: string;
  currency: string;
  locale: string;
  is_active: boolean;
  star_rating: number;
  description: string;
  settings?: HotelSettings;
  created_at: string;
}

export type ExpenseCategory =
  | 'salaries'
  | 'utilities'
  | 'maintenance'
  | 'supplies'
  | 'marketing'
  | 'food_beverage'
  | 'taxes_licenses'
  | 'software'
  | 'other';

export type ExpenseStatus = 'pending_approval' | 'approved' | 'rejected' | 'reversed';

export interface Expense {
  id: number;
  hotel: number;
  category: ExpenseCategory;
  category_display: string;
  title: string;
  description: string;
  amount: string;
  currency: string;
  expense_date: string;
  status: ExpenseStatus;
  status_display: string;
  recorded_by: number;
  recorded_by_name?: string;
  approved_by?: number;
  reversal_reason?: string;
  created_at: string;
}

export interface ExecutiveReportData {
  period: {
    filter: 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'custom';
    start_date: string;
    end_date: string;
  };
  kpis: {
    today_revenue: string;
    period_settled_revenue: string;
    period_booking_value: string;
    recorded_expenses: string;
    refunds: string;
    net_revenue: string;
    estimated_profit: string;
    outstanding_balance: string;
    total_rooms: number;
    occupied_rooms: number;
    available_rooms: number;
    maintenance_rooms: number;
    occupancy_rate: number;
    today_arrivals: number;
    today_departures: number;
  };
  alerts: Array<{
    type: 'warning' | 'success' | 'info' | 'attention';
    title: string;
    message: string;
  }>;
  trends: Array<{
    date: string;
    revenue: number;
    expenses: number;
    profit: number;
  }>;
}

export interface HotelMembershipItem {
  id: number;
  hotel: number;
  user: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    full_name: string;
  };
  role: 'owner' | 'manager' | 'receptionist' | 'housekeeping' | 'finance' | 'auditor';
  is_active: boolean;
  created_at: string;
}

export interface RoomType {
  id: number;
  name: string;
  description: string;
  max_occupancy: number;
  base_price: string;
  amenities: string[];
  photos?: { id: number; url: string }[];
  created_at: string;
}

export type RoomStatus = 'available' | 'occupied' | 'maintenance' | 'cleaning' | 'out_of_order';

export interface Room {
  id: number;
  room_number: string;
  floor: number;
  status: RoomStatus;
  status_display: string;
  room_type: number;
  room_type_detail?: RoomType;
  description: string;
  notes?: string;
  created_at: string;
}

export interface Guest {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  id_type: string;
  id_number: string;
  nationality: string;
  date_of_birth?: string;
  is_vip: boolean;
  is_blacklisted?: boolean;
  blacklist_reason?: string;
  blacklisted_at?: string | null;
  created_at: string;
  // Visit history (from the API)
  stays?: number;
  bookings_count?: number;
  cancellations?: number;
  total_paid?: string;
  last_visit?: string | null;
  avg_rating?: number | null;
}

export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';

export interface Booking {
  id: number;
  reference: string;
  status: BookingStatus;
  status_display: string;
  room: number;
  room_number: string;
  guest: number;
  guest_name: string;
  check_in: string;
  check_out: string;
  num_adults: number;
  num_children: number;
  rate_per_night: string;
  total_amount: string;
  currency: string;
  special_requests: string;
  cancellation_reason?: string;
  actual_check_in?: string;
  actual_check_out?: string;
  source?: "panel" | "telegram";
  approved_at?: string | null;
  payment_due_at?: string | null;
  guest_phone?: string;
  paid_amount?: string;
  cancel_requested_at?: string | null;
  guest_blacklisted?: boolean;
  refunded_amount?: string;
  review_rating?: number | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ManagerOperationsData {
  today: string;
  filter: 'today' | 'last_7_days' | 'this_month';
  kpis: {
    total_rooms: number;
    occupied_rooms: number;
    available_rooms: number;
    cleaning_rooms: number;
    maintenance_rooms: number;
    occupancy_rate: number;
    today_arrivals: number;
    today_departures: number;
    pending_check_ins: number;
    pending_check_outs: number;
    dirty_tasks: number;
    in_progress_tasks: number;
    clean_tasks: number;
    inspected_tasks: number;
    overdue_tasks: number;
    pending_payments_amount: string;
  };
  arrivals: Array<{
    id: number;
    reference: string;
    guest_name: string;
    guest_phone?: string;
    room_number: string;
    room_type: string;
    check_in: string;
    check_out: string;
    status: string;
    total_amount: string;
    special_requests?: string;
  }>;
  departures: Array<{
    id: number;
    reference: string;
    guest_name: string;
    guest_phone?: string;
    room_number: string;
    room_type: string;
    check_in: string;
    check_out: string;
    status: string;
    total_amount: string;
  }>;
  alerts: Array<{
    id: string;
    type: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
    link?: string;
  }>;
  staff_on_duty: Array<{
    id: number;
    role: string;
    name: string;
    email: string;
  }>;
  guest_requests: Array<{
    booking_id: number;
    guest_name: string;
    room_number: string;
    request: string;
    status: string;
  }>;
}

