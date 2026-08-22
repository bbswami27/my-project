'use strict';

const express=require('express');

module.exports=function createMessageRoutes({messageStore,userStore,requireAuth,emitToUser}){
  const router=express.Router();

  router.get('/with/:peerId',requireAuth,async(req,res)=>{
    try{
      const peer=await userStore.getById(req.params.peerId);
      if(!peer||!peer.phoneVerified)return res.status(404).json({error:'Registered GitPit user not found'});
      const messages=await messageStore.listConversation(req.auth.user.id,peer.id,req.query.limit,req.query.before||null);
      res.json({ok:true,peer,messages});
    }catch(e){console.error('[CORE V2 MSG] list failed',e);res.status(500).json({error:'Unable to load messages'});}
  });

  router.post('/',requireAuth,async(req,res)=>{
    try{
      const recipientId=String(req.body?.recipientId||'');
      const body=String(req.body?.body||'');
      const type=String(req.body?.type||'text');
      if(!recipientId)return res.status(400).json({error:'recipientId is required'});
      if(type==='text'&&!body.trim())return res.status(400).json({error:'Message cannot be empty'});
      if(type!=='text')return res.status(400).json({error:'Core v2 Step 5 currently accepts text messages only'});
      const recipient=await userStore.getById(recipientId);
      if(!recipient||!recipient.phoneVerified)return res.status(404).json({error:'Recipient is not a registered GitPit user'});
      if(recipient.id===req.auth.user.id)return res.status(400).json({error:'Cannot message your own account'});
      const message=await messageStore.create({senderId:req.auth.user.id,recipientId:recipient.id,body:body.trim(),type:'text',clientId:req.body?.clientId||null});
      emitToUser?.(recipient.id,'message:new',message);
      res.status(201).json({ok:true,message});
    }catch(e){console.error('[CORE V2 MSG] send failed',e);res.status(500).json({error:'Unable to send message'});}
  });

  router.post('/:id/delivered',requireAuth,async(req,res)=>{
    try{
      const msg=await messageStore.markDelivered(req.params.id,req.auth.user.id);
      if(!msg)return res.status(404).json({error:'Message not found'});
      emitToUser?.(msg.senderId,'message:delivered',{messageId:msg.id,deliveredAt:msg.deliveredAt});
      res.json({ok:true,message:msg});
    }catch(e){res.status(500).json({error:'Unable to update delivery'});}
  });

  router.post('/:id/read',requireAuth,async(req,res)=>{
    try{
      const peerId=String(req.body?.peerId||'');
      if(!peerId)return res.status(400).json({error:'peerId is required'});
      const updated=await messageStore.markReadUpTo(req.auth.user.id,peerId,req.params.id);
      if(updated.length)emitToUser?.(peerId,'message:read',{messageIds:updated.map(x=>x.id),readAt:updated[0].read_at||new Date().toISOString()});
      res.json({ok:true,count:updated.length});
    }catch(e){res.status(500).json({error:'Unable to update read status'});}
  });

  return router;
};
