
import { createLogger } from '@xen-orchestra/log'
import  get from 'lodash/get.js';

const log = createLogger('xo:store')

class UnauthorizedFeatureError extends Error{
  constructor(featureCode) {
    super(`feature ${featureCode} is not authorized for current installation`);
    this.name = "UnauthorizedFeatureError";
    this.featureCode = featureCode;
  }
}

const AUTHORIZATIONS = {
  BACKUP: {
    FULL: 2,
    METADATA: 3,
    S3: 2
  },
  PLUGIN: {
    BACKUP: {
      REPORTS: 3
    }
  }
}


export default class {

  _getMinPlan(featureCode){
    return get(AUTHORIZATIONS, featureCode, 0)
  }

  checkFeatureAuthorization(featureCode){
    if(process.env.XOA_PLAN < this._getMinPlan(featureCode)){
      throw new UnauthorizedFeatureError(featureCode)
    }
  }
}
