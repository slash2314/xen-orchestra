import React from 'react'
import { withState } from 'reaclette'
import { Switch, Route } from 'react-router-dom'
import { Map } from 'immutable'

import Tabs from '../../components/Tabs'
import Dashboard from './dashboard'
import Icon from '../../components/Icon'
import PanelHeader from '../../components/PanelHeader'
import { ObjectsByType, Pool } from '../libs/xapi'

interface ParentState {
  objectsByType: ObjectsByType
}

interface State {}

interface Props {
  id: string
}

interface ParentEffects {}

interface Effects {}

interface Computed {
  pools?: Map<string, Pool>
  pool?: Pool
}

const PoolInfo = withState<State, Props, Effects, Computed, ParentState, ParentEffects>(
  {
    /*initialState: props => ({
        selectedVm: props.location.pathname.split('/')[3],
      }),*/
    computed: {
      pools: state => state.objectsByType?.get('pool'),
      pool: ({ pools }) => pools?.get(pools?.keySeq().first()),
    },
  },
  ({ state: { pool } }) => {
    // console.log(' HEY !!! ', pool)
    return (
      <>
        <PanelHeader>
          {' '}
          <span>
            <Icon icon='cloud' color={'#0085FF'} /> {pool.name_label}
          </span>
        </PanelHeader>
        <Tabs
          list={[
            {
              id: '1',
              label: 'DASHBORAD',
              component: <Dashboard />,
            },
            {
              id: '2',
              label: 'SYSTEM',
            },
          ]}
        />
      </>
    )
  }
)

export default PoolInfo
