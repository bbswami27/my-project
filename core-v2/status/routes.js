'use strict';

const express=require('express');

module.exports=function createStatusRoutes({pool,statusStore,requireAuth,emitToUser}){
  const router=express.Router();

  router.post('/',requireAuth,async(req,res)=>{
    try{
      const type=String(req.body?.type||'text');
      const allowed=new Set(['text','image','video']);
      if(!allowed.has(type))return res.status(400).json({error:'Status type must be text, image or video'});
      const text=String(req.body?.text||'').trim();
      if(type==='text'&&!text)return res.status(400).json({error:'Status text is required'});
      if(type!=='text'&&!req.body?.mediaObjectKey)return res.status(400).json({error:'Uploaded media is required'});
      const s=await statusStore.create({userId:req.auth.user.id,type,text,mediaObjectKey:req.body?.mediaObjectKey||null,mediaName:req.body?.mediaName||null,mediaMime:req.body?.mediaMime||null,mediaSize:req.body?.mediaSize||null});
      emitToUser?.(req.auth.user.id,'status:new',s);
      const {rows}=await pool.query(`SELECT id FROM gp2_users WHERE phone_verified=TRUE AND id<>$1`,[req.auth.user.id]);
      rows.forEach(u=>emitToUser?.(u.id,'status:new',{...s,user:{id:req.auth.user.id,name:req.auth.user.name,phone:req.auth.user.phone,avatar:req.auth.user.avatar||''}}));
      res.status(201).json({ok:true,status:s});
    }catch(e){console.error('[CORE V2 STATUS] post failed',e);res.status(500).json({error:'Unable to post status'});}
  });

  router.get('/feed',requireAuth,async(req,res)=>{
    try{
      const {rows}=await pool.query(`SELECT id FROM gp2_users WHERE phone_verified=TRUE`);
      const ids=[...new Set([req.auth.user.id,...rows.map(r=>r.id)])];
      const statuses=await statusStore.listForUsers(ids);
      res.json({ok:true,statuses});
    }catch(e){res.status(500).json({error:'Unable to load status feed'});}
  });

  router.post('/:id/view',requireAuth,async(req,res)=>{
    try{
      const result=await statusStore.markViewed(req.params.id,req.auth.user.id);
      if(!result)return res.status(404).json({error:'Status not found or expired'});
      if(result.ownerId!==req.auth.user.id)emitToUser?.(result.ownerId,'status:viewed',{statusId:req.params.id,viewer:{id:req.auth.user.id,name:req.auth.user.name,phone:req.auth.user.phone}});
      res.json({ok:true});
    }catch(e){res.status(500).json({error:'Unable to mark status viewed'});}
  });

  router.get('/:id/views',requireAuth,async(req,res)=>{
    try{
      const views=await statusStore.views(req.params.id,req.auth.user.id);
      if(views===null)return res.status(404).json({error:'Status not found'});
      res.json({ok:true,views});
    }catch(e){res.status(500).json({error:'Unable to load viewers'});}
  });

  return router;
};
