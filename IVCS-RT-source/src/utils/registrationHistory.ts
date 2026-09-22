import type {RegistrationState} from '../types';
export type RegistrationSnapshot=Pick<RegistrationState,'transforms'|'detachedSeriesIds'|'relationPolicies'>;
export function registrationSnapshot(state:RegistrationState):RegistrationSnapshot {
  return structuredClone({transforms:state.transforms,detachedSeriesIds:state.detachedSeriesIds,relationPolicies:state.relationPolicies});
}
/** A transaction spans one pointer gesture and includes every related series. */
export class RegistrationHistory {
  past:RegistrationSnapshot[]=[];future:RegistrationSnapshot[]=[];
  private transaction:RegistrationSnapshot|null=null;
  begin(state:RegistrationState){this.transaction ??= registrationSnapshot(state);}
  commit(before:RegistrationState,after:RegistrationState){
    if(JSON.stringify(registrationSnapshot(before))===JSON.stringify(registrationSnapshot(after)))return;
    if(this.transaction)return;
    this.past=[...this.past.slice(-49),registrationSnapshot(before)];this.future=[];
  }
  end(state:RegistrationState){const before=this.transaction;this.transaction=null;if(before)this.commit({...state,...before},state);}
  undo(state:RegistrationState){const previous=this.past.pop();if(!previous)return state;this.future.push(registrationSnapshot(state));return {...state,...previous};}
  redo(state:RegistrationState){const next=this.future.pop();if(!next)return state;this.past.push(registrationSnapshot(state));return {...state,...next};}
}
