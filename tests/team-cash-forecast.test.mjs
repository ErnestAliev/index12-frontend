import assert from "node:assert/strict";
import {test} from "node:test";
import {accountLabel,accountRequestForecast,liveRequestCosts} from "../src/utils/teamCashForecast.js";
test("account and owner use one label",()=>assert.equal(accountLabel({name:"BCC UU",companyId:"c"},[{_id:"c",name:"ТОО UU"}]),"BCC UU / ТОО UU"));
test("all and today's balances use live requests once, including a just-enriched request",()=>{
 const account={_id:"a",companyId:"c",balanceCents:100000};
 const request={_id:"r",state:"manager_review",companyId:"c",dueDate:"2026-11-06",amountCents:10000,placement:{accountId:"a"}};
 const future={...request,_id:"future",dueDate:"2026-11-07",amountCents:20000};
 const costs=liveRequestCosts([request,future],[{...request,amountCents:15000},{...request,_id:"new",amountCents:90000}]);
 let result=accountRequestForecast(account,costs,"2026-11-06");
 assert.equal(result.afterRequestsCents,-25000);assert.equal(result.afterDueRequestsCents,-5000);
 result=accountRequestForecast(account,liveRequestCosts(costs,[{...request,state:"rejected"}]),"2026-11-06");
 assert.equal(result.afterDueRequestsCents,10000);
 assert.equal(accountRequestForecast(account,[{...request,operationId:"saved"},{...request,placement:{accountId:"other"}}],"2026-11-06").requestedCents,0);
});
