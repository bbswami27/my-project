'use strict';

const express=require('express');
const ALLOWED=new Set(['text','image','video','document','audio','voice','link']);

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
      const body=String(req.body?.body||'').trim();
      const type=String(req.body?.type||'text').toLowerCase();
      if(!recipientId)return res.status(400).json({error:'recipientId is required'});
      if(!ALLOWED.has(type))return res.status(400).json({error:'Unsupported message type'});
      if(type==='text'&&!body)return res.status(400).json({error:'Message cannot be empty'});
      const recipient=await userStore.getById(recipientId);
      if(!recipient||!recipient.phoneVerified)return res.status(404).json({error:'Recipient is not a registered GitPit user'});
      if(recipient.id===req.auth.user.id)return res.status(400).json({error:'Cannot message your own account'});

      const mediaTypes=new Set(['image','video','document','audio','voice']);
      let mediaObjectKey=null,mediaName=null,mediaMime=null,mediaSize=null,linkUrl=null;
      if(mediaTypes.has(type)){
        mediaObjectKey=String(req.body?.mediaObjectKey||'');
        mediaName=String(req.body?.mediaName||'');
        mediaMime=String(req.body?.mediaMime||'');
        mediaSize=Number(req.body?.mediaSize||0);
        if(!mediaObjectKey.startsWith(`core-v2/${req.auth.user.id}/`))return res.status(400).json({error:'Invalid attachment object key'});
        if(!mediaName||!mediaMime||mediaSize<=0||mediaSize>50*1024*1024)return res.status(400).json({error:'Invalid attachment metadata'});
      }
      if(type==='link'){
        linkUrl=String(req.body?.linkUrl||body||'').trim();
        try{const u=new URL(linkUrl);if(!['http:','https:'].includes(u.protocol))throw new Error();}
        catch{return res.status(400).json({error:'Valid http/https link is required'});}
      }

      const message=await messageStore.create({senderId:req.auth.user.id,recipientId:recipient.id,body,type,clientId:req.body?.clientId||null,mediaObjectKey,mediaName,mediaMime,mediaSize,linkUrl});
      emitToUser?.(recipient.id,'message:new',message);
      res.status(201).json({ok:true,message});
    }catch(e){console.error('[CORE V2 MSG] send failed',e);res.status(500).json({error:'Unable to send message'});}
  });

  router.post('/:id/delivered',requireAuth,async(req,res)=>{
    try{const msg=await messageStore.markDelivered(req.params.id,req.auth.user.id);if(!msg)return res.status(404).json({error:'Message not found'});emitToUser?.(msg.senderId,'message:delivered',{messageId:msg.id,deliveredAt:msg.deliveredAt});res.json({ok:true,message:msg});}
    catch(e){res.status(500).json({error:'Unable to update delivery'});}
  });

  router.post('/:id/read',requireAuth,async(req,res)=>{
    try{const peerId=String(req.body?.peerId||'');if(!peerId)return res.status(400).json({error:'peerId is required'});const updated=await messageStore.markReadUpTo(req.auth.user.id,peerId,req.params.id);if(updated.length)emitToUser?.(peerId,'message:read',{messageIds:updated.map(x=>x.id),readAt:updated[0].read_at||new Date().toISOString()});res.json({ok:true,count:updated.length});}
    catch(e){res.status(500).json({error:'Unable to update read status'});}
  });

  return router;
};
