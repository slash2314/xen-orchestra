import React from 'react'
import { withState } from 'reaclette'
import { Route } from 'react-router-dom'

interface ParentState {}

interface State {}

interface Props {}

interface ParentEffects {}

interface Effects {}

interface Computed {}

const Dashboard = withState<State, Props, Effects, Computed, ParentState, ParentEffects>(
  {
    /*initialState: props => ({
        selectedVm: props.location.pathname.split('/')[3],
      }),*/
  },
  () => <span>{'RAJAAA'}</span>
)

export default Dashboard
