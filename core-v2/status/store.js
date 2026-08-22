'use strict';

const crypto=require('crypto');

class StatusStore{
  constructor(pool){this.pool=pool;}
  async ensureSchema(){
    await this.pool.query(`CREATE TABLE IF NOT EXISTS gp2_statuses(
      id VARCHAR(120) PRIMARY KEY,
      user_id VARCHAR(100) NOT NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'text',
      text_body TEXT NOT NULL DEFAULT '',
      media_object_key TEXT,
      media_name TEXT,
      media_mime TEXT,
      media_size BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      deleted_at TIMESTAMPTZ
    )`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS gp2_status_views(
      status_id VARCHAR(120) NOT NULL,
      viewer_id VARCHAR(100) NOT NULL,
      viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(status_id,viewer_id)
    )`);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_gp2_status_user_exp ON gp2_statuses(user_id,expires_at)');
  }
  async create({userId,type='text',text='',mediaObjectKey=null,mediaName=null,mediaMime=null,mediaSize=null}){
    const id=`sts_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const expires=new Date(Date.now()+24*60*60*1000);
    const {rows}=await this.pool.query(`INSERT INTO gp2_statuses(id,user_id,type,text_body,media_object_key,media_name,media_mime,media_size,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[id,userId,type,String(text||''),mediaObjectKey,mediaName,mediaMime,mediaSize,expires]);
    return this.map(rows[0]);
  }
  async listForUsers(userIds){
    if(!userIds.length)return[];
    const {rows}=await this.pool.query(`SELECT s.*,u.name,u.phone,u.avatar,
      (SELECT COUNT(*)::int FROM gp2_status_views v WHERE v.status_id=s.id) AS view_count
      FROM gp2_statuses s JOIN gp2_users u ON u.id=s.user_id
      WHERE s.user_id = ANY($1::text[]) AND s.deleted_at IS NULL AND s.expires_at>NOW()
      ORDER BY s.created_at ASC`,[userIds]);
    return rows.map(r=>({...this.map(r),user:{id:r.user_id,name:r.name,phone:r.phone,avatar:r.avatar||''},viewCount:r.view_count||0}));
  }
  async markViewed(statusId,viewerId){
    const {rows}=await this.pool.query(`SELECT user_id FROM gp2_statuses WHERE id=$1 AND deleted_at IS NULL AND expires_at>NOW()`,[statusId]);
    if(!rows.length)return null;
    if(rows[0].user_id!==viewerId)await this.pool.query(`INSERT INTO gp2_status_views(status_id,viewer_id) VALUES($1,$2) ON CONFLICT(status_id,viewer_id) DO NOTHING`,[statusId,viewerId]);
    return {ownerId:rows[0].user_id};
  }
  async views(statusId,ownerId){
    const {rows:own}=await this.pool.query('SELECT 1 FROM gp2_statuses WHERE id=$1 AND user_id=$2',[statusId,ownerId]);if(!own.length)return null;
    const {rows}=await this.pool.query(`SELECT v.viewed_at,u.id,u.name,u.phone,u.avatar FROM gp2_status_views v JOIN gp2_users u ON u.id=v.viewer_id WHERE v.status_id=$1 ORDER BY v.viewed_at DESC`,[statusId]);return rows;
  }
  map(r){return{id:r.id,userId:r.user_id,type:r.type,text:r.text_body,mediaObjectKey:r.media_object_key,mediaName:r.media_name,mediaMime:r.media_mime,mediaSize:r.media_size,createdAt:r.created_at,expiresAt:r.expires_at};}
}
module.exports=StatusStore;
