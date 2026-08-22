'use strict';

const express=require('express');

module.exports=function createMediaRoutes({requireAuth,storage}){
  const router=express.Router();
  router.post('/upload-url',requireAuth,async(req,res)=>{
    try{
      const out=await storage.createUpload({userId:req.auth.user.id,fileName:req.body?.fileName,mime:req.body?.mime,size:req.body?.size});
      res.json({ok:true,...out});
    }catch(e){console.error('[CORE V2 MEDIA] upload-url',e);res.status(400).json({error:e.message||'Unable to create upload URL'});}
  });
  router.get('/download-url',requireAuth,async(req,res)=>{
    try{const out=await storage.createDownload(req.query.objectKey);res.json({ok:true,...out});}
    catch(e){res.status(400).json({error:e.message||'Unable to create download URL'});}
  });
  return router;
};
