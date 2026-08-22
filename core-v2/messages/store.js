'use strict';

const crypto = require('crypto');

class MessageStore {
  constructor(pool) { this.pool = pool; }

  async ensureSchema() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS gp2_messages (
      id VARCHAR(120) PRIMARY KEY,
      sender_id VARCHAR(100) NOT NULL,
      recipient_id VARCHAR(100) NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      type VARCHAR(40) NOT NULL DEFAULT 'text',
      client_id VARCHAR(120),
      media_object_key TEXT,
      media_name TEXT,
      media_mime VARCHAR(150),
      media_size BIGINT,
      link_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      delivered_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    )`);
    await this.pool.query('ALTER TABLE gp2_messages ADD COLUMN IF NOT EXISTS media_object_key TEXT');
    await this.pool.query('ALTER TABLE gp2_messages ADD COLUMN IF NOT EXISTS media_name TEXT');
    await this.pool.query('ALTER TABLE gp2_messages ADD COLUMN IF NOT EXISTS media_mime VARCHAR(150)');
    await this.pool.query('ALTER TABLE gp2_messages ADD COLUMN IF NOT EXISTS media_size BIGINT');
    await this.pool.query('ALTER TABLE gp2_messages ADD COLUMN IF NOT EXISTS link_url TEXT');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_gp2_messages_pair ON gp2_messages(sender_id,recipient_id,created_at)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_gp2_messages_recipient ON gp2_messages(recipient_id,created_at)');
  }

  async create({ senderId, recipientId, body, type='text', clientId=null, mediaObjectKey=null, mediaName=null, mediaMime=null, mediaSize=null, linkUrl=null }) {
    const id = `msg_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const { rows } = await this.pool.query(
      `INSERT INTO gp2_messages(id,sender_id,recipient_id,body,type,client_id,media_object_key,media_name,media_mime,media_size,link_url)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [id,senderId,recipientId,String(body||''),type,clientId,mediaObjectKey,mediaName,mediaMime,mediaSize,linkUrl]
    );
    return this.map(rows[0]);
  }

  async listConversation(userId, peerId, limit=100, before=null) {
    const params=[userId,peerId,Math.min(Math.max(Number(limit)||100,1),200)];
    let beforeSql='';
    if(before){params.push(new Date(before));beforeSql=` AND created_at < $4`;}
    const {rows}=await this.pool.query(
      `SELECT * FROM gp2_messages
       WHERE deleted_at IS NULL
         AND ((sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1))
         ${beforeSql}
       ORDER BY created_at DESC LIMIT $3`,params);
    return rows.reverse().map(r=>this.map(r));
  }

  async markDelivered(messageId, recipientId) {
    const {rows}=await this.pool.query(
      `UPDATE gp2_messages SET delivered_at=COALESCE(delivered_at,NOW())
       WHERE id=$1 AND recipient_id=$2 RETURNING *`,[messageId,recipientId]);
    return rows[0]?this.map(rows[0]):null;
  }

  async markReadUpTo(userId, peerId, messageId) {
    const {rows}=await this.pool.query('SELECT created_at FROM gp2_messages WHERE id=$1 AND recipient_id=$2 LIMIT 1',[messageId,userId]);
    if(!rows.length)return [];
    const {rows:updated}=await this.pool.query(
      `UPDATE gp2_messages SET delivered_at=COALESCE(delivered_at,NOW()), read_at=COALESCE(read_at,NOW())
       WHERE recipient_id=$1 AND sender_id=$2 AND read_at IS NULL AND created_at <= $3 RETURNING id,read_at,delivered_at`,
      [userId,peerId,rows[0].created_at]);
    return updated;
  }

  map(r){return {id:r.id,senderId:r.sender_id,recipientId:r.recipient_id,body:r.body,type:r.type,clientId:r.client_id,mediaObjectKey:r.media_object_key,mediaName:r.media_name,mediaMime:r.media_mime,mediaSize:r.media_size?Number(r.media_size):null,linkUrl:r.link_url,createdAt:r.created_at,deliveredAt:r.delivered_at,readAt:r.read_at};}
}

module.exports=MessageStore;
