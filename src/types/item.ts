export type Category = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
};

export type Item = {
  id: string;
  user_id: string;
  category_id: string | null;
  name: string;
  notes: string | null;
  purchase_date: string | null;
  price_yen: number | null;
  tags: string[];
  image_path: string | null;
  created_at: string;
  updated_at: string;
};

export type ItemWithCategory = Item & {
  category: Pick<Category, "id" | "name" | "color"> | null;
};
