'use strict';
const assert = require('node:assert/strict');
const db = require('../database');
const original = db.data.users;
try {
  db.data.users = [
    {id:'account_1',name:'Phone One',email:'one@example.com',emailVerified:true,phone:'',phoneVerified:false},
    {id:'account_2',name:'Phone Two',email:'two@example.com',emailVerified:true,phone:'',phoneVerified:false},
    {id:'account_3',name:'Verified Phone',email:'',emailVerified:false,phone:'+919876543210',phoneVerified:true}
  ];
  const emailMatch=db.syncRegisteredContacts([{name:'Saved Name',phone:'+919000000001',emails:['two@example.com']}]);
  assert.equal(emailMatch.registered.length,1,'Email-only account must match saved phonebook email');
  assert.equal(emailMatch.registered[0].id,'account_2');
  assert.equal(emailMatch.registered[0].phone,'','Do not assign arbitrary phonebook number to email account');
  assert.equal(emailMatch.registered[0].savedName,'Saved Name');
  const phoneOnly=db.syncRegisteredContacts([{name:'Not verified',phone:'+919000000001'}]);
  assert.equal(phoneOnly.registered.length,0,'Unknown number must not map to email-verified account');
  const verifiedPhone=db.syncRegisteredContacts([{name:'Known phone',phone:'9876543210'}]);
  assert.equal(verifiedPhone.registered.length,1);
  assert.equal(verifiedPhone.registered[0].id,'account_3');
  const emailContactOnly=db.syncRegisteredContacts([{name:'Email Only',email:'one@example.com'}]);
  assert.equal(emailContactOnly.registered[0]?.id,'account_1');
  const publicDirectory=db.getAllUsers('account_1');
  assert.ok(publicDirectory.some(x=>x.id==='account_2'&&x.emailVerified),'Email-only account must appear in registered directory');
  assert.ok(!publicDirectory.find(x=>x.id==='account_2')?.phone,'No fabricated phone number for email-only member');
  console.log('GitPit verified identity / email-only phonebook regression tests passed.');
} finally {
  db.data.users = original;
}
