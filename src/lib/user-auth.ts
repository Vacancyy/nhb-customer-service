// 用户实名认证信息服务

import { query } from './postgres';

interface UserAuthInfo {
  name: string;
  idCard: string;
  phone: string;
}

// 根据三要素查询实名认证信息
export async function getUserAuthByElements(
  name: string,
  idCard: string,
  phone: string
): Promise<UserAuthInfo | null> {
  const rows = await query<{ name: string; id_card: string; phone: string }>(
    'SELECT name, id_card, phone FROM user_auth WHERE name = $1 AND id_card = $2 AND phone = $3',
    [name, idCard, phone]
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    name: rows[0].name,
    idCard: rows[0].id_card,
    phone: rows[0].phone,
  };
}

// 保存实名认证信息
export async function saveUserAuth(
  name: string,
  idCard: string,
  phone: string
): Promise<void> {
  await query(
    'INSERT INTO user_auth (name, id_card, phone) VALUES ($1, $2, $3)',
    [name, idCard, phone]
  );
}